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
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "hsy-smoke-"));
let child;
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
  assert.equal(manifest.siteUrl, "http://127.0.0.1:3120");
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
  const probe = net.createServer();
  await new Promise((r) => probe.listen(0, "127.0.0.1", r));
  const port = probe.address().port;
  await new Promise((r) => probe.close(r));
  child = spawn(process.execPath, ["scripts/start-platform.mjs"], {
    cwd: release,
    detached: true,
    stdio: "ignore",
    env: {
      ...process.env,
      NODE_ENV: "production",
      SITE_URL: "http://127.0.0.1:3120",
      PORT: String(port),
      DATABASE_PROVIDER: "sqlite",
      DATABASE_URL: "",
      SQLITE_DATABASE_URL: "",
      MYSQL_DATABASE_URL: "",
      SESSION_SECRET: randomBytes(32).toString("hex"),
      RATE_LIMIT_SECRET: randomBytes(32).toString("hex"),
      CONSULTATIONS_ENABLED: "false",
      PRODUCTION_CONSULTATIONS_APPROVED: "false",
      ANALYTICS_ENABLED: "false",
      AI_API_KEY: "",
      OPENAI_API_KEY: "",
      GEO_WORKER_ENABLED: "false",
      AI_GENERATION_ENABLED: "false",
      AI_EXTERNAL_TRANSMISSION_APPROVED: "false",
      NEXT_TELEMETRY_DISABLED: "1",
    },
  });
  let ready = false;
  for (let i = 0; i < 80; i++) {
    if (child.exitCode !== null) throw Error("Packaged Next process stopped");
    try {
      const r = await fetch(`http://127.0.0.1:${port}/api/health/`, {
        signal: AbortSignal.timeout(1500),
      });
      assert.equal(r.status, 503);
      ready = true;
      break;
    } catch {
      await new Promise((r) => setTimeout(r, 250));
    }
  }
  assert.equal(ready, true, "Packaged server did not start");
  const home = await fetch(`http://127.0.0.1:${port}/`);
  assert.equal(home.status, 200);
  assert.ok((await home.text()).includes("沪上银"));
  const robots = await fetch(`http://127.0.0.1:${port}/robots.txt`);
  assert.equal(robots.status, 200);
  assert.ok(
    (await robots.text()).includes("http://127.0.0.1:3120/sitemap.xml"),
  );
  console.log(
    JSON.stringify({
      extractedArtifact: true,
      linuxNativeArgon2: true,
      generatedClients: 3,
      workerConfigurationOnly: true,
      home: 200,
      robots: 200,
      noDatabaseHealth: 503,
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
  fs.rmSync(temporary, { recursive: true, force: true });
}
