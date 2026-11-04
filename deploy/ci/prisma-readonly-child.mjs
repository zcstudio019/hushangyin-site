// Runs only as an unprivileged account inside a network namespace with a synthetic DB.
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { DatabaseSync } from "node:sqlite";
import {
  checkPlatform,
  assertPrismaBundle,
  clientDirectories,
  library,
  schemaEngine,
} from "./prisma-engines.mjs";

const [release, runtime, parentNetwork] = process.argv.slice(2);
assert.equal(process.versions.node, "24.22.2");
assert.notEqual(process.getuid(), 0);
assert.ok(runtime.startsWith(os.tmpdir() + path.sep + "hsy-readonly-"));
assert.notEqual(
  fs.readlinkSync("/proc/self/ns/net"),
  parentNetwork,
  "Network namespace was not isolated",
);
assert.ok(
  Object.keys(os.networkInterfaces()).every((name) => name === "lo"),
  "External network interface found",
);
assert.equal(fs.statSync(release).uid, 0, "Release must be owned by root");
for (const dir of [
  release,
  path.join(release, "node_modules"),
  path.join(release, "node_modules/@prisma/engines"),
  ...clientDirectories.map((d) => path.join(release, "node_modules", d)),
])
  assert.throws(() => fs.accessSync(dir, fs.constants.W_OK));
process.chdir(release);
await checkPlatform(release);
assertPrismaBundle(release);
const database = path.join(runtime, "probe.sqlite");
assert.equal(fs.existsSync(database), false);
new DatabaseSync(database).close();
const env = {
  ...process.env,
  DATABASE_PROVIDER: "sqlite",
  DATABASE_URL: "file:" + database,
  SQLITE_DATABASE_URL: "file:" + database,
  MYSQL_DATABASE_URL: "",
  CHECKPOINT_DISABLE: "1",
  PRISMA_HIDE_UPDATE_MESSAGE: "1",
};
for (const key of [
  "PRISMA_SCHEMA_ENGINE_BINARY",
  "PRISMA_QUERY_ENGINE_LIBRARY",
  "PRISMA_QUERY_ENGINE_BINARY",
  "PRISMA_CLI_BINARY_TARGETS",
])
  delete env[key];
function run(args) {
  const result = spawnSync(process.execPath, args, {
    cwd: release,
    env,
    encoding: "utf8",
    timeout: 90000,
    maxBuffer: 2 * 1024 * 1024,
  });
  if (result.status !== 0) {
    console.error(result.stdout, result.stderr);
    throw Error("Readonly Prisma command failed: " + args.join(" "));
  }
}
const direct = spawnSync(
  path.join(release, "node_modules/@prisma/engines", schemaEngine),
  ["--version"],
  { env, encoding: "utf8", timeout: 10000 },
);
assert.equal(direct.status, 0, "Schema Engine cannot execute");
run(["scripts/db-tool.mjs", "validate", "sqlite"]);
for (let i = 0; i < 2; i++)
  run([
    "node_modules/prisma/build/index.js",
    "migrate",
    "deploy",
    "--schema",
    "prisma/sqlite/schema.prisma",
  ]);
const require = createRequire(path.join(release, "package.json"));
for (const dir of clientDirectories)
  assert.equal(
    typeof require(path.join(release, "node_modules", dir, library))
      .QueryEngine,
    "function",
    "Query Engine failed to dlopen",
  );
const { PrismaClient } = require("@hsy/sqlite-client");
const db = new PrismaClient({ datasourceUrl: "file:" + database, log: [] });
try {
  await db.$connect();
  await db.rateLimitBucket.create({
    data: {
      key: "ci-readonly-probe",
      count: 1,
      expiresAt: new Date(Date.now() + 60000),
    },
  });
  await db.rateLimitBucket.update({
    where: { key: "ci-readonly-probe" },
    data: { count: 2 },
  });
  assert.equal(
    (
      await db.rateLimitBucket.findUniqueOrThrow({
        where: { key: "ci-readonly-probe" },
      })
    ).count,
    2,
  );
  await db.rateLimitBucket.delete({ where: { key: "ci-readonly-probe" } });
  const result = await db.$queryRawUnsafe(
    "SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL ORDER BY migration_name",
  );
  const expected = fs
    .readdirSync(path.join(release, "prisma/sqlite/migrations"))
    .filter((name) =>
      fs.existsSync(
        path.join(release, "prisma/sqlite/migrations", name, "migration.sql"),
      ),
    )
    .sort();
  assert.deepEqual(
    result.map((row) => row.migration_name),
    expected,
  );
} finally {
  await db.$disconnect();
}
console.log(
  JSON.stringify({
    ordinaryUser: true,
    rootOwnedReadonlyRelease: true,
    networkIsolated: true,
    schemaValidate: true,
    schemaEngineExecute: true,
    isolatedMigrationTwice: true,
    threeQueryEnginesLoaded: true,
    sqliteCrud: true,
    realBusinessDatabaseUsed: false,
  }),
);
