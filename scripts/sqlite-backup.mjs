import fs from "node:fs";
import path from "node:path";
import { DatabaseSync, backup } from "node:sqlite";
import {
  randomBytes,
  createCipheriv,
  createDecipheriv,
  createHash,
} from "node:crypto";
import { pipeline } from "node:stream/promises";
import { Writable } from "node:stream";
import { spawnSync } from "node:child_process";
process.umask(0o077);
const requestedDirectory = path.resolve(
  process.env.SQLITE_BACKUP_DIR || "/var/backups/hushangyin",
);
const restore = process.argv[2] === "restore";
const privatePath = (value) => {
  const file = path.resolve(value);
  if (
    !path.isAbsolute(value) ||
    /(^|[\\/])(public|\.next|tmp)([\\/]|$)/i.test(file)
  )
    throw Error("PRIVATE_ABSOLUTE_PATH_REQUIRED");
  return file;
};
const directory = privatePath(requestedDirectory);
const key = fs.readFileSync(
  privatePath(process.env.BACKUP_ENCRYPTION_KEY_FILE || ""),
);
if (key.length !== 32) throw Error("BACKUP_KEY_MUST_BE_32_BYTES");
async function decrypt(file, destination) {
  const size = fs.statSync(file).size;
  if (size < 36) throw Error("BACKUP_FORMAT_INVALID");
  const fd = fs.openSync(file, "r"),
    header = Buffer.alloc(20),
    tag = Buffer.alloc(16);
  try {
    fs.readSync(fd, header, 0, 20, 0);
    fs.readSync(fd, tag, 0, 16, size - 16);
  } finally {
    fs.closeSync(fd);
  }
  if (header.subarray(0, 8).toString() !== "HSYSQL16")
    throw Error("BACKUP_FORMAT_INVALID");
  const decipher = createDecipheriv("aes-256-gcm", key, header.subarray(8));
  decipher.setAuthTag(tag);
  await pipeline(
    fs.createReadStream(file, { start: 20, end: size - 17 }),
    decipher,
    destination,
  );
}
let temporary;
try {
  if (restore) {
    const input = privatePath(process.env.BACKUP_FILE || ""),
      output = privatePath(process.env.RESTORE_DATABASE_FILE || "");
    if (fs.existsSync(output)) throw Error("RESTORE_TARGET_EXISTS");
    const outputFd = fs.openSync(output, "wx", 0o600);
    temporary = output;
    const destination = fs.createWriteStream(output, {
      fd: outputFd,
      autoClose: true,
    });
    try {
      await decrypt(input, destination);
    } finally {
      destination.destroy();
    }
    const db = new DatabaseSync(output);
    const integrity = db.prepare("PRAGMA integrity_check").all(),
      foreign = db.prepare("PRAGMA foreign_key_check").all();
    db.close();
    if (Object.values(integrity[0])[0] !== "ok" || foreign.length)
      throw Error("RESTORE_CHECK_FAILED");
    temporary = undefined;
    console.log(
      JSON.stringify({
        restored: true,
        integrity: "ok",
        foreignKeyViolations: 0,
        destination: output,
      }),
    );
  } else {
    const source = privatePath(
      (process.env.DATABASE_URL || "").replace(/^file:/, "").split("?")[0],
    );
    if (!fs.existsSync(source)) throw Error("SOURCE_DATABASE_MISSING");
    fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
    const stamp = new Date().toISOString().replace(/[:.]/g, "-"),
      file = path.join(directory, "hsy-sqlite-" + stamp + ".db.aes");
    temporary = path.join(
      directory,
      ".online-" + randomBytes(8).toString("hex") + ".sqlite",
    );
    const db = new DatabaseSync(source, { readOnly: true });
    try {
      await backup(db, temporary);
    } finally {
      db.close();
    }
    const copy = new DatabaseSync(temporary, { readOnly: true });
    try {
      if (
        Object.values(copy.prepare("PRAGMA integrity_check").get())[0] !==
          "ok" ||
        copy.prepare("PRAGMA foreign_key_check").all().length
      )
        throw Error("BACKUP_CHECK_FAILED");
    } finally {
      copy.close();
    }
    const nonce = randomBytes(12),
      cipher = createCipheriv("aes-256-gcm", key, nonce),
      stream = fs.createWriteStream(file, { flags: "wx", mode: 0o600 });
    stream.write(Buffer.concat([Buffer.from("HSYSQL16"), nonce]));
    await pipeline(fs.createReadStream(temporary), cipher, stream);
    fs.appendFileSync(file, cipher.getAuthTag());
    let sqliteHeader = Buffer.alloc(0);
    await decrypt(
      file,
      new Writable({
        write(chunk, _encoding, callback) {
          if (sqliteHeader.length < 16)
            sqliteHeader = Buffer.concat([
              sqliteHeader,
              chunk.subarray(0, 16 - sqliteHeader.length),
            ]);
          callback();
        },
      }),
    );
    if (sqliteHeader.toString() !== "SQLite format 3\u0000")
      throw Error("BACKUP_AUTH_FAILED");
    const digest = createHash("sha256");
    for await (const chunk of fs.createReadStream(file)) digest.update(chunk);
    const manifest = {
      encryptedFile: file,
      sha256: digest.digest("hex"),
      integrity: "ok",
      foreignKeyViolations: 0,
      authenticated: true,
      createdAt: new Date().toISOString(),
    };
    fs.writeFileSync(file + ".json", JSON.stringify(manifest, null, 2), {
      mode: 0o600,
    });
    if (process.env.OSS_BACKUP_ENABLED === "true") {
      const destination = process.env.OSS_BACKUP_DESTINATION || "";
      if (!/^oss:\/\/[a-z0-9-]+\/[a-zA-Z0-9/_-]+\/$/.test(destination))
        throw Error("OSS_DESTINATION_INVALID");
      // User must provision a private bucket + approved least-privilege ossutil config first.
      const result = spawnSync(
        "/usr/local/bin/ossutil",
        [
          "cp",
          file,
          destination,
          "--config-file",
          "/etc/hushangyin/ossutil.conf",
        ],
        { stdio: "ignore", timeout: 120000 },
      );
      if (result.status !== 0) throw Error("OFFSITE_BACKUP_FAILED");
    }
    const days = Number(process.env.BACKUP_RETENTION_DAYS || 30);
    if (!Number.isInteger(days) || days < 7 || days > 365)
      throw Error("RETENTION_INVALID");
    for (const entry of fs.readdirSync(directory)) {
      if (
        !/^hsy-sqlite-\d{4}-\d\d-\d\dT[0-9Z-]+\.db\.aes(?:\.json)?$/.test(entry)
      )
        continue;
      const own = path.join(directory, entry);
      if (
        fs.lstatSync(own).isFile() &&
        fs.statSync(own).mtimeMs < Date.now() - days * 86400000
      )
        fs.unlinkSync(own);
    }
    console.log(JSON.stringify(manifest));
  }
} catch {
  console.error(
    "SQLite备份或恢复未完成；未覆盖已有数据库。请检查私有配置、磁盘与完整性。",
  );
  process.exitCode = 1;
} finally {
  key.fill(0);
  if (temporary && fs.existsSync(temporary)) fs.unlinkSync(temporary);
}
