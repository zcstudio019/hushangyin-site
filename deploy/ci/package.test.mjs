import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import test from "node:test";
import assert from "node:assert/strict";
import { allowed, verifyTree, entries } from "./package-release.mjs";
import {
  assertPrismaBundle,
  clientDirectories,
  library,
  schemaEngine,
  target,
} from "./prisma-engines.mjs";

test("OpenSSL1.1-only CLI or any missing OpenSSL3 client engine must fail packaging", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "hsy-engine-test-"));
  const header = Buffer.alloc(20);
  header.write("\x7fELF");
  header[4] = 2;
  header[5] = 1;
  header.writeUInt16LE(62, 18);
  const write = (name, value = header) => {
    const file = path.join(root, name);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, value, { mode: 0o755 });
  };
  try {
    write("node_modules/@prisma/engines/schema-engine-debian-openssl-1.1.x");
    assert.throws(
      () => assertPrismaBundle(root),
      /OpenSSL3 Prisma engine missing/,
    );
    write("node_modules/@prisma/engines/" + schemaEngine);
    write("node_modules/@prisma/engines/" + library);
    for (const client of clientDirectories) {
      write("node_modules/" + client + "/" + library);
      write(
        "node_modules/" + client + "/schema.prisma",
        'binaryTargets = ["' + target + '"]',
      );
    }
    assertPrismaBundle(root);
    for (const client of clientDirectories) {
      const file = path.join(root, "node_modules", client, library);
      fs.unlinkSync(file);
      assert.throws(
        () => assertPrismaBundle(root),
        /OpenSSL3 Prisma engine missing/,
      );
      fs.writeFileSync(file, header);
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("private files, database files, cache and test artifacts are excluded; runtime inputs stay", () => {
  for (const value of [
    ".env",
    ".env.local",
    "deploy/ecs/app.env",
    "deploy/ecs/app.env.production",
    "src/.env.local",
    ".git/config",
    ".local-postgres/private.json",
    "node_modules/.cache/x",
    "backups/archive.sql",
    "public/customer.sqlite",
    "public/customer.sqlite-wal",
    "private/backup.dump.aes",
    "key.pem",
    "tsconfig.tsbuildinfo",
    ".next/cache/webpack/data",
    ".next/trace",
    "deploy/ci/package.test.mjs",
    "test-results/screenshot.png",
  ])
    assert.equal(allowed(value), false, value);
  for (const value of [
    ".next/BUILD_ID",
    ".next/server/app/page.js",
    "node_modules/@hsy/sqlite-client/index.js",
    "node_modules/.prisma/client/libquery_engine-debian-openssl-3.0.x.so.node",
    "prisma/sqlite/migrations/202611020001_initial/migration.sql",
    "deploy/ecs/runtime.env.example",
    "public/templates/geo-questions.csv",
    "scripts/geo-generation-worker.ts",
    "deploy/tests/runtime-config.sh",
  ])
    assert.equal(allowed(value), true, value);
});
test("tree validation rejects escaping/absolute symlinks and missing runtime inputs", () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "hsy-tree-test-")),
    root = path.join(temporary, "release");
  fs.mkdirSync(root);
  try {
    fs.writeFileSync(path.join(temporary, "outside"), "synthetic");
    fs.symlinkSync("../outside", path.join(root, "escape"));
    assert.throws(() => verifyTree(root), /Escaping release symlink/);
    fs.unlinkSync(path.join(root, "escape"));
    fs.symlinkSync(
      path.join(temporary, "outside"),
      path.join(root, "absolute"),
    );
    assert.throws(() => verifyTree(root), /Absolute release symlink/);
    fs.unlinkSync(path.join(root, "absolute"));
    assert.throws(() => verifyTree(root), /Required runtime file missing/);
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
});
test("copy uses explicit roots, retains dot-build directory and internal links, removes private data", () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "hsy-copy-test-")),
    source = path.join(temporary, "source"),
    release = path.join(temporary, "release");
  fs.mkdirSync(source);
  fs.mkdirSync(release);
  const write = (name, body = "synthetic") => {
    const file = path.join(source, name);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, body);
  };
  try {
    write(".next/BUILD_ID");
    write(".next/cache/private");
    write("deploy/ecs/app.env");
    write("deploy/ecs/runtime.env.example");
    write("public/templates/geo-questions.csv");
    write("private.sqlite");
    write(".env.local");
    for (const name of entries.filter((n) =>
      fs.existsSync(path.join(source, n)),
    ))
      fs.cpSync(path.join(source, name), path.join(release, name), {
        recursive: true,
        verbatimSymlinks: true,
        filter: (value) => allowed(path.relative(source, value)),
      });
    assert.equal(fs.existsSync(path.join(release, ".next/BUILD_ID")), true);
    for (const name of [
      ".next/cache",
      "deploy/ecs/app.env",
      "private.sqlite",
      ".env.local",
    ])
      assert.equal(fs.existsSync(path.join(release, name)), false);
    assert.equal(
      fs.existsSync(path.join(release, "deploy/ecs/runtime.env.example")),
      true,
    );
    assert.equal(
      fs.existsSync(path.join(release, "public/templates/geo-questions.csv")),
      true,
    );
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
});
