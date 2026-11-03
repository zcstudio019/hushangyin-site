import fs from "node:fs/promises";
import path from "node:path";
import { createHash, randomBytes } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
const exec = promisify(execFile),
  root = path.resolve("."),
  dir = path.join(root, ".local-postgres");
const configFile = path.join(dir, "private.json");
const bin = path.join(dir, "runtime", "embedded_postgres", "pginstall", "bin");
const data = path.join(dir, "data");
const action = process.argv[2] || "status";
let operation = "setup";
async function run(name, args = [], options = {}) {
  operation = name;
  return exec(path.join(bin, name + ".exe"), args, {
    windowsHide: true,
    timeout: 20000,
    ...options,
  });
}
async function sql(text, config, database = "postgres") {
  operation = "SQL";
  const child = (await import("node:child_process")).spawn(
    path.join(bin, "psql.exe"),
    [
      "-X",
      "-w",
      "-v",
      "ON_ERROR_STOP=1",
      "-h",
      "127.0.0.1",
      "-p",
      "55432",
      "-U",
      "postgres",
      "-d",
      database,
      "-At",
      "-f",
      "-",
    ],
    {
      windowsHide: true,
      env: {
        ...process.env,
        PGPASSWORD: config.superPassword,
        PGCONNECT_TIMEOUT: "5",
      },
      stdio: ["pipe", "pipe", "pipe"],
    },
  );
  let output = "";
  child.stdout.on("data", (chunk) => (output += chunk));
  child.stderr.resume();
  child.stdin.end(text);
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error("SQL_TIMEOUT"));
    }, 15000);
    child.on("error", () => {
      clearTimeout(timer);
      reject(new Error("SQL_EXECUTION_FAILED"));
    });
    child.on("exit", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error("SQL_EXECUTION_FAILED"));
    });
  });
  return output.trim();
}
try {
  if (action === "setup") {
    await fs.mkdir(dir, { recursive: true });
    try {
      await fs.access(path.join(bin, "postgres.exe"));
    } catch {
      const url =
        "https://files.pythonhosted.org/packages/e2/a0/9349561246bcf5da8c58fd1571cc31fb003012b349a31f7bb22054437eb4/embedded_postgres-18.6.3-py3-none-win_amd64.whl";
      const response = await fetch(url);
      if (!response.ok) throw new Error("DOWNLOAD_FAILED");
      const buffer = Buffer.from(await response.arrayBuffer());
      if (
        createHash("sha256").update(buffer).digest("hex") !==
        "4d8277d743e3e4053d353fd9d8ecfdd89b8df8f0cd67c0ded73ffe538893c3b5"
      )
        throw new Error("CHECKSUM_FAILED");
      const archive = path.join(dir, "runtime.whl");
      await fs.writeFile(archive, buffer);
      const python =
        "C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe";
      await exec(
        python,
        [
          "-c",
          "import zipfile,pathlib,sys; z=zipfile.ZipFile(sys.argv[1]); p=pathlib.Path(sys.argv[2]).resolve(); assert all((p/n).resolve().is_relative_to(p) for n in z.namelist()); z.extractall(p)",
          archive,
          path.join(dir, "runtime"),
        ],
        { windowsHide: true },
      );
      console.log(
        "Portable PostgreSQL archive verified and extracted inside project.",
      );
    }
    let config;
    try {
      config = JSON.parse(await fs.readFile(configFile, "utf8"));
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      config = {
        superPassword: randomBytes(32).toString("hex"),
        appPassword: randomBytes(32).toString("hex"),
        sessionSecret: randomBytes(48).toString("hex"),
        rateSecret: randomBytes(48).toString("hex"),
        adminEmail: "local-admin@hushangyin.test",
        adminPassword: randomBytes(24).toString("base64url"),
      };
      await fs.writeFile(configFile, JSON.stringify(config, null, 2), {
        flag: "wx",
      });
    }
    try {
      await fs.access(path.join(data, "PG_VERSION"));
    } catch {
      const pw = path.join(dir, "init-password");
      await fs.writeFile(pw, config.superPassword, { flag: "wx" });
      try {
        await run("initdb", [
          "-D",
          data,
          "-U",
          "postgres",
          "--auth=scram-sha-256",
          "--encoding=UTF8",
          "--locale=C",
          `--pwfile=${pw}`,
        ]);
      } finally {
        await fs.unlink(pw);
      }
      await fs.appendFile(
        path.join(data, "postgresql.conf"),
        "\nlisten_addresses = '127.0.0.1'\nport = 55432\nlog_statement = 'none'\nlog_min_error_statement = 'panic'\n",
      );
    }
    try {
      await run("pg_ctl", ["status", "-D", data]);
    } catch {
      await run("pg_ctl", [
        "start",
        "-D",
        data,
        "-l",
        path.join(dir, "server.log"),
        "-w",
      ]);
    }
    if (
      (await sql(
        "SELECT count(*) FROM pg_roles WHERE rolname='hsy_local';",
        config,
      )) === "0"
    )
      await sql(
        `CREATE ROLE hsy_local LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE PASSWORD '${config.appPassword}';`,
        config,
      );
    for (const name of ["hushangyin_local", "hushangyin_integration_test"])
      if (
        (await sql(
          `SELECT count(*) FROM pg_database WHERE datname='${name}';`,
          config,
        )) === "0"
      )
        await sql(`CREATE DATABASE ${name} OWNER hsy_local;`, config);
    try {
      await fs.access(path.join(root, ".env"));
      console.log(
        "Existing .env preserved; local connection details are in ignored private configuration.",
      );
    } catch {
      const url = `postgresql://hsy_local:${config.appPassword}@127.0.0.1:55432/hushangyin_local?schema=public`;
      const testUrl = url.replace(
        "/hushangyin_local?",
        "/hushangyin_integration_test?",
      );
      await fs.writeFile(
        path.join(root, ".env"),
        `DATABASE_URL=${url}\nTEST_DATABASE_URL=${testUrl}\nSITE_URL=http://127.0.0.1:3000\nSESSION_SECRET=${config.sessionSecret}\nRATE_LIMIT_SECRET=${config.rateSecret}\nTRUST_PROXY=false\nCONSULTATIONS_ENABLED=false\nADMIN_EMAIL=${config.adminEmail}\nADMIN_NAME=本地开发管理员\nADMIN_PASSWORD=${config.adminPassword}\n`,
        { flag: "wx" },
      );
    }
    console.log("Local PostgreSQL ready on 127.0.0.1:55432; separate databases ready. Existing consultation setting preserved; new setups default to disabled.");
  } else if (action === "start") {
    await run("pg_ctl", [
      "start",
      "-D",
      data,
      "-l",
      path.join(dir, "server.log"),
      "-w",
    ]);
    console.log("Local database started.");
  } else if (action === "stop") {
    await run("pg_ctl", ["stop", "-D", data, "-m", "fast", "-w"]);
    console.log("Local database stopped.");
  } else {
    await run("pg_ctl", ["status", "-D", data]);
    console.log("Local PostgreSQL is running.");
  }
} catch {
  console.error(
    `Local PostgreSQL operation failed at ${operation}. No credentials or command details have been logged.`,
  );
  process.exitCode = 1;
}
