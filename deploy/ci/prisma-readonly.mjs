import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { verifyTree } from "./package-release.mjs";

assert.equal(process.platform, "linux");
assert.equal(process.arch, "x64");
const archive = path.resolve(process.argv[2]);
const outerNetwork = process.argv[3];
if (outerNetwork) {
  assert.equal(
    process.getuid(),
    0,
    "Offline container must manage the extracted release as root",
  );
  assert.match(outerNetwork, /^net:\[\d+\]$/);
}
assert.ok(fs.statSync(archive).isFile());
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "hsy-readonly-"));
const release = path.join(temporary, "release"),
  runtime = path.join(temporary, "runtime");
const root = process.getuid() === 0,
  uid = 65534,
  gid = 65534;
function privileged(command, args) {
  const result = spawnSync(
    root ? command : "sudo",
    root ? args : ["-n", command, ...args],
    { stdio: "inherit" },
  );
  assert.equal(
    result.status,
    0,
    "CI privilege setup failed; do not skip readonly verification",
  );
}
async function fingerprint(directory) {
  const digest = createHash("sha256");
  async function visit(file) {
    const st = fs.lstatSync(file, { bigint: true });
    digest.update(
      JSON.stringify([
        path.relative(directory, file),
        String(st.mode),
        String(st.uid),
        String(st.gid),
        String(st.size),
        String(st.mtimeNs),
      ]),
    );
    if (st.isSymbolicLink()) digest.update(fs.readlinkSync(file));
    else if (st.isDirectory())
      for (const name of fs.readdirSync(file).sort())
        await visit(path.join(file, name));
    else
      for await (const chunk of fs.createReadStream(file)) digest.update(chunk);
  }
  await visit(directory);
  return digest.digest("hex");
}
try {
  assert.equal(
    spawnSync("tar", ["-xzf", archive, "-C", temporary, "--no-same-owner"])
      .status,
    0,
  );
  verifyTree(release);
  fs.chmodSync(temporary, 0o755);
  fs.mkdirSync(runtime, { mode: 0o700 });
  fs.mkdirSync(path.join(runtime, "home"), { mode: 0o700 });
  privileged("chown", ["-R", `${uid}:${gid}`, runtime]);
  privileged("chown", ["-R", "0:0", release]);
  privileged("chmod", ["-R", "a-w", release]);
  const before = await fingerprint(release),
    parentNetwork = outerNetwork ?? fs.readlinkSync("/proc/self/ns/net");
  const args = [
    `--reuid=${uid}`,
    `--regid=${gid}`,
    "--clear-groups",
    "--no-new-privs",
    "--",
    process.execPath,
    path.join(release, "deploy/ci/prisma-readonly-child.mjs"),
    release,
    runtime,
    parentNetwork,
  ];
  const result = spawnSync(
    outerNetwork ? "setpriv" : root ? "unshare" : "sudo",
    outerNetwork
      ? args
      : [...(root ? [] : ["-n", "unshare"]), "--net", "--", "setpriv", ...args],
    {
      cwd: release,
      env: {
        PATH:
          path.dirname(process.execPath) +
          ":/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin",
        HOME: path.join(runtime, "home"),
        XDG_CACHE_HOME: path.join(runtime, "home/cache"),
        CI: "true",
        NEXT_TELEMETRY_DISABLED: "1",
      },
      stdio: "inherit",
      timeout: 240000,
    },
  );
  assert.equal(
    result.status,
    0,
    "Readonly/offline Prisma acceptance failed; artifact must not be uploaded",
  );
  assert.equal(
    await fingerprint(release),
    before,
    "Release files or metadata changed during Prisma commands",
  );
  console.log(
    JSON.stringify({
      readonlyPrismaAcceptance: true,
      releaseFingerprintUnchanged: true,
      nodeModulesUnchanged: true,
    }),
  );
} finally {
  // Only this mkdtemp-owned extracted copy is returned to its original owner for cleanup.
  if (fs.existsSync(release)) {
    privileged("chown", [
      "-R",
      `${process.getuid()}:${process.getgid()}`,
      release,
    ]);
    privileged("chmod", ["-R", "u+w", release]);
  }
  if (fs.existsSync(runtime))
    privileged("chown", [
      "-R",
      `${process.getuid()}:${process.getgid()}`,
      runtime,
    ]);
  fs.rmSync(temporary, { recursive: true, force: true });
}
