import { releaseMode, releaseOrigins } from "./release-mode.mjs";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import net from "node:net";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { verifyTree } from "./package-release.mjs";

const archive = path.resolve(process.argv[2] || "");
assert.ok(fs.statSync(archive).isFile());
const production = releaseMode() === "production";
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "hsy-smoke-"));
let child;
let databaseDirectory;
try {
  assert.equal(
    spawnSync("tar", ["-xzf", archive, "-C", temporary, "--no-same-owner"])
      .status,
    0,
  );
  const release = path.join(temporary, "release");
  verifyTree(release);
  const manifest = JSON.parse(
    fs.readFileSync(path.join(release, "RELEASE_MANIFEST.json")),
  );
  const origin = releaseOrigins[releaseMode()];
  assert.equal(manifest.siteUrl, origin);
  const require = createRequire(path.join(release, "package.json"));
  for (const id of [
    "@prisma/client",
    "@hsy/sqlite-client",
    "@hsy/mysql-client",
  ])
    assert.ok(require(id).Prisma.dmmf.datamodel.models.length >= 31);
  const argon = require("@node-rs/argon2"),
    value = randomBytes(24).toString("hex");
  assert.equal(await argon.verify(await argon.hash(value), value), true);
  const workerCheck = spawnSync(
    process.execPath,
    [
      "--conditions=react-server",
      "--import",
      "tsx",
      "scripts/geo-generation-worker.ts",
      "--check-config",
    ],
    {
      cwd: release,
      env: {
        ...process.env,
        DATABASE_URL: "",
        AI_API_KEY: "",
        OPENAI_API_KEY: "",
        AI_GENERATION_ENABLED: "false",
        AI_EXTERNAL_TRANSMISSION_APPROVED: "false",
        GEO_WORKER_ENABLED: "false",
      },
      stdio: "pipe",
      timeout: 30000,
    },
  );
  assert.equal(
    workerCheck.status,
    0,
    "Packaged Worker/tsx configuration check failed",
  );
  const env = {
    ...process.env,
    NODE_ENV: "production",
    SITE_URL: origin,
    LOCAL_TEST_MODE: "false",
    DATABASE_PROVIDER: "sqlite",
    DATABASE_URL: "",
    SQLITE_DATABASE_URL: "",
    MYSQL_DATABASE_URL: "",
    SESSION_SECRET: randomBytes(32).toString("hex"),
    RATE_LIMIT_SECRET: randomBytes(32).toString("hex"),
    CONSULTATIONS_ENABLED: "false",
    PRODUCTION_CONSULTATIONS_APPROVED: "false",
    ANALYTICS_ENABLED: "false",
    ANALYTICS_PRODUCTION_APPROVED: "false",
    AI_API_KEY: "",
    OPENAI_API_KEY: "",
    GEO_WORKER_ENABLED: "false",
    AI_GENERATION_ENABLED: "false",
    AI_EXTERNAL_TRANSMISSION_APPROVED: "false",
    NEXT_TELEMETRY_DISABLED: "1",
  };
  const email = "production-smoke@example.test";
  const password = "Hsy!48-" + randomBytes(18).toString("hex");
  if (production) {
    assert.ok(fs.existsSync("/.dockerenv"));
    assert.ok(Object.keys(os.networkInterfaces()).every((name) => name === "lo"));
    const database = "/var/lib/hushangyin/production.sqlite";
    fs.mkdirSync(path.dirname(database), { mode: 0o700 });
    databaseDirectory = path.dirname(database);
    env.DATABASE_URL = env.SQLITE_DATABASE_URL = "file:" + database;
    const run = (args, settings = {}) => {
      const result = spawnSync(process.execPath, args, {
        cwd: release,
        env: { ...env, ...settings },
        stdio: "inherit",
        timeout: 90000,
      });
      assert.equal(result.status, 0, "Isolated production database check failed");
    };
    const config = "/etc/hushangyin";
    fs.mkdirSync(config, { mode: 0o700 });
    const keyFile = path.join(config, "backup.key");
    fs.writeFileSync(keyFile, randomBytes(32), { flag: "wx", mode: 0o600 });
    const appFile = path.join(config, "production.app.env");
    const backupFile = path.join(config, "production.backup.env");
    const appSettings = fs.readFileSync(path.join(release, "deploy/ecs/app.env.example"), "utf8")
      .replace(/^SESSION_SECRET=.*$/m, "SESSION_SECRET=" + env.SESSION_SECRET)
      .replace(/^RATE_LIMIT_SECRET=.*$/m, "RATE_LIMIT_SECRET=" + env.RATE_LIMIT_SECRET);
    fs.writeFileSync(appFile, appSettings, { mode: 0o640 });
    fs.writeFileSync(backupFile,
      fs.readFileSync(path.join(release, "deploy/ecs/backup.env.example"), "utf8")
        .replace("SQLITE_BACKUP_DIR=/var/backups/hushangyin\n", "SQLITE_BACKUP_DIR=/var/backups/hushangyin/production\n"),
      { mode: 0o640 });
    run(["deploy/ecs/production-check.mjs", "config", appFile, backupFile]);
    fs.writeFileSync(appFile, appSettings.replace("AI_GENERATION_ENABLED=false", "AI_GENERATION_ENABLED=true"));
    assert.equal(spawnSync(process.execPath,
      ["deploy/ecs/production-check.mjs", "config", appFile, backupFile],
      { cwd: release, env, timeout: 10000 }).status, 1);
    fs.writeFileSync(appFile, appSettings);
    run(["deploy/ecs/production-check.mjs", "new-db"]);
    run(["scripts/db-tool.mjs", "deploy", "sqlite"]);
    run(["deploy/ecs/production-check.mjs", "wal"]);
    run(["--conditions=react-server", "--import", "tsx", "scripts/create-admin.ts"], {
      ADMIN_EMAIL: email, ADMIN_NAME: "Smoke", ADMIN_PASSWORD: password,
    });
    run(["--import", "tsx", "-e", `
      const assert = require("node:assert/strict");
      const { createDatabaseClient } = require("./src/lib/db/provider");
      const p = createDatabaseClient();
      async function check() {
        const write = (question) => p.$transaction(async (tx) => {
          await tx.$queryRaw\`SELECT pg_advisory_xact_lock(1)\`;
          await tx.$queryRaw\`SELECT id FROM geo_questions FOR UPDATE\`;
          return tx.geoQuestion.create({ data: { question, category: "Smoke" } });
        });
        try {
          await Promise.all([write("Smoke 1"), write("Smoke 2")]);
          assert.equal(await p.geoQuestion.count(), 2);
          assert.equal(await p.adminUser.count({ where: { role: "SUPER_ADMIN" } }), 1);
        } finally { await p.$disconnect(); }
      }
      check().catch((error) => { console.error(error); process.exitCode = 1; });
    `]);
    run(["deploy/ecs/production-check.mjs", "database"]);
    const backupDirectory = path.join(databaseDirectory, "backups");
    const backupEnv = {
      SQLITE_BACKUP_DIR: backupDirectory,
      BACKUP_ENCRYPTION_KEY_FILE: keyFile,
      OSS_BACKUP_ENABLED: "false",
    };
    run(["scripts/sqlite-backup.mjs"], backupEnv);
    const archive = fs.readdirSync(backupDirectory).find((file) => file.endsWith(".db.aes"));
    assert.ok(archive);
    run(["scripts/sqlite-backup.mjs", "restore"], {
      ...backupEnv,
      BACKUP_FILE: path.join(backupDirectory, archive),
      RESTORE_DATABASE_FILE: path.join(databaseDirectory, "restore.sqlite"),
    });
  }
  const probe = net.createServer();
  await new Promise((r) => probe.listen(0, "127.0.0.1", r));
  const port = probe.address().port;
  await new Promise((r) => probe.close(r));
  child = spawn(process.execPath, ["scripts/start-platform.mjs"], {
    cwd: release,
    detached: true,
    stdio: "ignore",
    env: { ...env, PORT: String(port) },
  });
  let ready = false;
  for (let i = 0; i < 80; i++) {
    if (child.exitCode !== null) throw Error("Packaged Next process stopped");
    try {
      const r = await fetch(`http://127.0.0.1:${port}/api/health/`, {
        signal: AbortSignal.timeout(1500),
      });
      assert.equal(r.status, production ? 200 : 503);
      ready = true;
      break;
    } catch {
      await new Promise((r) => setTimeout(r, 250));
    }
  }
  assert.equal(ready, true, "Packaged server did not start");
  const home = await fetch(`http://127.0.0.1:${port}/`);
  assert.equal(home.status, 200);
  const html = await home.text();
  assert.ok(html.includes("沪上银"));
  assert.ok(html.includes(`rel="canonical" href="${origin}/"`));
  assert.ok(html.includes(`property="og:url" content="${origin}/"`));
  assert.ok(html.includes('href="/contact/"'));
  const login = await fetch(`http://127.0.0.1:${port}/admin/`, {
    redirect: "manual",
  });
  assert.equal(login.status, 307);
  assert.equal(login.headers.get("location"), "/admin/login/");
  if (production) {
    const signedIn = await fetch(`http://127.0.0.1:${port}/api/admin/login/`, {
      method: "POST",
      headers: { Origin: origin, "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    assert.equal(signedIn.status, 200);
    const cookie = signedIn.headers.get("set-cookie");
    assert.match(cookie, /^__Host-hsy_session=/);
    assert.match(cookie, /; Secure/i);
    assert.match(cookie, /; HttpOnly/i);
    const admin = await fetch(`http://127.0.0.1:${port}/admin/`, {
      redirect: "manual",
      headers: { Cookie: cookie.split(";")[0] },
    });
    assert.equal(admin.headers.get("location"), "/admin/dashboard/");
  }
  const sitemap = await fetch(`http://127.0.0.1:${port}/sitemap.xml`);
  assert.equal(sitemap.status, 200);
  assert.ok((await sitemap.text()).includes(`<loc>${origin}/</loc>`));
  const robots = await fetch(`http://127.0.0.1:${port}/robots.txt`);
  assert.equal(robots.status, 200);
  assert.ok(
    (await robots.text()).includes(origin + "/sitemap.xml"),
  );
  console.log(
    JSON.stringify({
      extractedArtifact: true,
      linuxNativeArgon2: true,
      generatedClients: 3,
      workerConfigurationOnly: true,
      home: 200,
      robots: 200,
      health: production ? 200 : 503,
      isolatedProductionLoginAndGeoWrites: production,
      realDatabaseConnected: false,
    }),
  );
} finally {
  if (child?.pid) {
    try {
      process.kill(-child.pid, "SIGTERM");
    } catch (e) {
      if (e.code !== "ESRCH") throw e;
    }
    await new Promise((r) => setTimeout(r, 1500));
    try {
      process.kill(-child.pid, "SIGKILL");
    } catch (e) {
      if (e.code !== "ESRCH") throw e;
    }
  }
  if (databaseDirectory) fs.rmSync(databaseDirectory, { recursive: true });
  fs.rmSync(temporary, { recursive: true, force: true });
}
