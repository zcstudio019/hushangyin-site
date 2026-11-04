import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

export const target = "debian-openssl-3.0.x";
export const library = `libquery_engine-${target}.so.node`;
export const schemaEngine = `schema-engine-${target}`;
export const clientDirectories = [
  ".prisma/client",
  "@hsy/sqlite-client",
  "@hsy/mysql-client",
];
export async function checkPlatform(root = process.cwd()) {
  assert.equal(process.platform, "linux");
  assert.equal(process.arch, "x64");
  const openssl = spawnSync("openssl", ["version"], { encoding: "utf8" });
  assert.equal(openssl.status, 0, "OpenSSL executable is required");
  assert.match(openssl.stdout, /^OpenSSL 3\./, "System OpenSSL must be 3.x");
  const require = createRequire(path.join(root, "package.json"));
  const info = await require("@prisma/get-platform").getPlatformInfo();
  console.log(
    JSON.stringify({
      systemOpenSSL: openssl.stdout.trim(),
      prismaTarget: info.binaryTarget,
      prismaLibssl: info.libssl,
      prismaDistro: info.targetDistro,
      nodeOpenSSL: process.versions.openssl,
    }),
  );
  assert.equal(
    info.binaryTarget,
    target,
    "Prisma detected a different platform; do not fall back to OpenSSL1.1",
  );
  assert.equal(info.libssl, "3.0.x");
  return info;
}
function assertElf(file) {
  assert.ok(
    fs.existsSync(file),
    "Required OpenSSL3 Prisma engine missing: " + file,
  );
  const fd = fs.openSync(file, "r"),
    header = Buffer.alloc(20);
  try {
    assert.equal(fs.readSync(fd, header, 0, 20, 0), 20);
  } finally {
    fs.closeSync(fd);
  }
  assert.equal(header.subarray(0, 4).toString("hex"), "7f454c46");
  assert.equal(header[4], 2, "64-bit ELF required");
  assert.equal(header[5], 1, "Little-endian ELF required");
  assert.equal(header.readUInt16LE(18), 62, "x86_64 engine required");
}
export function assertPrismaBundle(root, { clients = true } = {}) {
  const dir = path.join(root, "node_modules/@prisma/engines");
  assertElf(path.join(dir, schemaEngine));
  assertElf(path.join(dir, library));
  assert.ok(
    fs.statSync(path.join(dir, schemaEngine)).mode & 0o111,
    "Schema Engine must be executable",
  );
  if (clients)
    for (const client of clientDirectories) {
      const output = path.join(root, "node_modules", client);
      assertElf(path.join(output, library));
      assert.ok(
        fs
          .readFileSync(path.join(output, "schema.prisma"), "utf8")
          .includes('"' + target + '"'),
        "Generated schema must retain explicit OpenSSL3 target",
      );
    }
}
async function main() {
  await checkPlatform();
  const require = createRequire(path.join(process.cwd(), "package.json"));
  assert.equal(require("prisma/package.json").version, "6.19.3");
  if (process.argv[2] === "prepare") {
    assert.equal(
      process.env.PRISMA_CLI_BINARY_TARGETS,
      target,
      "Set CLI targets before npm ci and downloads",
    );
    // Explicit, fail-loud download for the locked Prisma version; npm postinstall can fail silently.
    await require("@prisma/engines").ensureNeededBinariesExist({
      clientEngineType: "library",
      hasMigrateAdapterInConfig: false,
      download: require("@prisma/fetch-engine").download,
    });
    assertPrismaBundle(process.cwd(), { clients: false });
  } else {
    assert.equal(process.argv[2], "check");
    assertPrismaBundle(process.cwd());
  }
  console.log(
    "Prisma OpenSSL3 engine bundle verified. No database connection was used.",
  );
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  await main();
