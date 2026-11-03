import fs from "node:fs";
import path from "node:path";
import { allowed } from "./package-release.mjs";
import assert from "node:assert/strict";

assert.equal(process.platform, "linux", "Linux runner required");
assert.equal(process.arch, "x64", "x64 runner required");
assert.equal(
  process.versions.node,
  "24.22.2",
  "Exact Node.js 24.22.2 required",
);
assert.equal(process.env.SITE_URL, "http://127.0.0.1:3120");
assert.equal(process.env.DATABASE_PROVIDER, "sqlite");
assert.equal(process.env.LOCAL_TEST_MODE, "false");
for (const key of [
  "DATABASE_URL",
  "SQLITE_DATABASE_URL",
  "MYSQL_DATABASE_URL",
  "TEST_DATABASE_URL",
  "SESSION_SECRET",
  "RATE_LIMIT_SECRET",
  "AI_API_KEY",
  "OPENAI_API_KEY",
]) {
  assert.ok(
    !process.env[key],
    "CI must not receive database connections or service secrets",
  );
}
for (const key of [
  "AI_GENERATION_ENABLED",
  "AI_EXTERNAL_TRANSMISSION_APPROVED",
  "GEO_WORKER_ENABLED",
  "CONSULTATIONS_ENABLED",
  "PRODUCTION_CONSULTATIONS_APPROVED",
  "ANALYTICS_ENABLED",
  "ANALYTICS_PRODUCTION_APPROVED",
  "MYSQL_PRODUCTION_APPROVED",
]) {
  assert.equal(
    process.env[key],
    "false",
    "External services and data collection must be disabled",
  );
}
for (const entry of fs.readdirSync(".")) {
  assert.ok(
    !(entry.startsWith(".env") && entry !== ".env.example"),
    "Remove private environment files from CI checkout",
  );
  assert.ok(
    ![
      ".npmrc",
      ".local-postgres",
      "backups",
      "test-results",
      ".next",
      "node_modules",
    ].includes(entry),
    "CI requires a clean source checkout without local state",
  );
}
function inspect(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    assert.ok(
      allowed(file) ||
        file.endsWith(".test.mjs") ||
        file.startsWith("deploy/tests"),
      "Private state must not be committed under build inputs",
    );
    if (entry.isSymbolicLink()) {
      const resolved = fs.realpathSync(file);
      assert.ok(
        resolved.startsWith(process.cwd() + path.sep),
        "Build input symlink escapes checkout",
      );
    } else if (entry.isDirectory()) inspect(file);
    else if (entry.name.endsWith(".env.example")) {
      for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
        const pair = line.match(/^([A-Z_]+)=(.*)$/);
        if (pair && /(?:PASSWORD|SECRET|API_KEY)$/.test(pair[1]))
          assert.ok(
            ["", '\"\"', "''"].includes(pair[2].trim()),
            "Environment examples must not contain credentials",
          );
      }
    }
  }
}
for (const dir of ["src", "scripts", "prisma", "public", "deploy"])
  inspect(dir);
assert.ok(fs.existsSync("package-lock.json"));
console.log(
  "Clean Linux x64 / Node24.22.2 checkout verified; no database URL, service key or enabled external integration.",
);
