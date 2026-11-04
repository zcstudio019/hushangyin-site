import fs from "node:fs";
import { assertPrismaBundle, target } from "./prisma-engines.mjs";
import path from "node:path";
import os from "node:os";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

export const entries = [
  ".next",
  "node_modules",
  "src",
  "scripts",
  "prisma",
  "public",
  "deploy",
  "package.json",
  "package-lock.json",
  "next.config.ts",
  "next-env.d.ts",
  "tsconfig.json",
  "postcss.config.mjs",
];
export function allowed(relative) {
  const normalized = relative.replaceAll("\\", "/");
  const parts = normalized.split("/");
  if (
    parts.some(
      (p) =>
        [
          ".git",
          ".local-postgres",
          "backups",
          "test-results",
          "playwright-report",
          "coverage",
          "__pycache__",
          ".cache",
          ".npm-cache",
          ".npmrc",
          "private.json",
          "credentials.json",
          "secrets.json",
          "id_rsa",
          "id_ed25519",
        ].includes(p) ||
        p.startsWith(".env") ||
        p.endsWith(".env") ||
        (p.includes(".env.") && !p.endsWith(".env.example")),
    )
  )
    return false;
  if (
    /\.(?:sqlite(?:3)?(?:-wal|-shm|-journal)?|db(?:-wal|-shm|-journal)?|dump|aes|key|pem|pfx|p12|log|tsbuildinfo)$/i.test(
      normalized,
    )
  )
    return false;
  if (
    /^\.next\/(?:cache|dev|diagnostics|types)(?:\/|$)/.test(normalized) ||
    /^\.next\/trace[^/]*(?:\/|$)/.test(normalized)
  )
    return false;
  if (/(?:^|\/)[^/]+\.test\.mjs$/.test(normalized)) return false;
  return true;
}
export function verifyTree(root) {
  let count = 0;
  function visit(relative) {
    assert.ok(allowed(relative), "Forbidden file in release");
    const full = path.join(root, relative),
      st = fs.lstatSync(full);
    if (st.isSymbolicLink()) {
      const target = fs.readlinkSync(full);
      assert.ok(!path.isAbsolute(target), "Absolute release symlink rejected");
      const resolved = fs.realpathSync(full);
      assert.ok(
        resolved.startsWith(root + path.sep),
        "Escaping release symlink rejected",
      );
      assert.ok(
        allowed(path.relative(root, resolved)),
        "Symlink to excluded data rejected",
      );
      return;
    }
    if (st.isDirectory())
      for (const name of fs.readdirSync(full)) visit(path.join(relative, name));
    else {
      assert.ok(st.isFile(), "Special files are forbidden");
      count++;
    }
  }
  for (const name of fs.readdirSync(root)) visit(name);
  for (const name of [
    ...entries.filter((n) => n !== "deploy"),
    ".next/BUILD_ID",
    "deploy/ecs/run-runtime.sh",
    "deploy/ecs/deploy-preview.sh",
    "node_modules/next/package.json",
    "node_modules/prisma/build/index.js",
    "node_modules/tsx/package.json",
  ])
    assert.ok(
      fs.existsSync(path.join(root, name)),
      "Required runtime file missing: " + name,
    );
  for (const client of [
    ".prisma/client",
    "@hsy/sqlite-client",
    "@hsy/mysql-client",
  ]) {
    const dir = path.join(root, "node_modules", client);
    assert.ok(
      fs.existsSync(path.join(dir, "schema.prisma")),
      "Generated Prisma client missing",
    );
    const engines = fs.readdirSync(dir).filter((n) => n.endsWith(".so.node"));
    assert.ok(engines.length > 0, "Linux Prisma native engine missing");
    for (const engine of engines) {
      const fd = fs.openSync(path.join(dir, engine), "r"),
        header = Buffer.alloc(4);
      try {
        fs.readSync(fd, header, 0, 4, 0);
      } finally {
        fs.closeSync(fd);
      }
      assert.equal(
        header.toString("hex"),
        "7f454c46",
        "Expected Linux ELF engine",
      );
    }
  }
  assertPrismaBundle(root);
  return count;
}
export async function packageRelease(source = process.cwd()) {
  assert.equal(process.platform, "linux");
  assert.equal(process.arch, "x64");
  assert.equal(process.versions.node, "24.22.2");
  assert.equal(process.env.SITE_URL, "http://127.0.0.1:3120");
  const commit = process.env.GITHUB_SHA;
  assert.match(commit || "", /^[a-f0-9]{40}$/);
  const run = process.env.GITHUB_RUN_ID || "local";
  assert.match(run, /^[a-zA-Z0-9_-]+$/);
  const out = path.resolve(
    process.env.HSY_ARTIFACT_DIR ||
      path.join(os.tmpdir(), "hushangyin-artifacts"),
  );
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "hsy-package-"));
  const release = path.join(temporary, "release");
  try {
    fs.mkdirSync(release);
    for (const name of entries) {
      assert.ok(
        fs.existsSync(path.join(source, name)),
        "Required build input missing: " + name,
      );
      fs.cpSync(path.join(source, name), path.join(release, name), {
        recursive: true,
        force: false,
        errorOnExist: true,
        verbatimSymlinks: true,
        filter: (value) => allowed(path.relative(source, value)),
      });
    }
    const files = verifyTree(release);
    fs.writeFileSync(
      path.join(release, "RELEASE_MANIFEST.json"),
      JSON.stringify(
        {
          purpose: "private-preview-only",
          commit,
          workflowRun: run,
          node: process.versions.node,
          platform: process.platform,
          arch: process.arch,
          prismaBinaryTarget: target,
          siteUrl: process.env.SITE_URL,
          includesDatabase: false,
          includesSecrets: false,
          files,
          packageLockSha256: createHash("sha256")
            .update(fs.readFileSync(path.join(release, "package-lock.json")))
            .digest("hex"),
          builtAt: new Date().toISOString(),
        },
        null,
        2,
      ),
    );
    fs.mkdirSync(out, { recursive: true });
    const filename = `hushangyin-preview-${commit.slice(0, 12)}-${run}.tar.gz`,
      archive = path.join(out, filename),
      checksum = archive + ".sha256";
    assert.ok(
      !fs.existsSync(archive) && !fs.existsSync(checksum),
      "Artifact already exists; refusing overwrite",
    );
    const tar = spawnSync(
      "tar",
      ["-czf", archive, "-C", temporary, "release"],
      { stdio: "inherit" },
    );
    assert.equal(tar.status, 0, "Release compression failed");
    const digest = createHash("sha256");
    for await (const chunk of fs.createReadStream(archive))
      digest.update(chunk);
    fs.writeFileSync(checksum, `${digest.digest("hex")}  ${filename}\n`, {
      flag: "wx",
    });
    if (process.env.GITHUB_OUTPUT)
      fs.appendFileSync(
        process.env.GITHUB_OUTPUT,
        `archive=${archive}\nchecksum=${checksum}\nfilename=${filename}\n`,
      );
    console.log(
      JSON.stringify({
        filename,
        files,
        platform: "linux-x64",
        databaseIncluded: false,
      }),
    );
    return { archive, checksum };
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  await packageRelease();
