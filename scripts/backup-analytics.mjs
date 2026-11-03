// Local-only, user-authorized migration backup. No plaintext dump or password in output.
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import {
  randomBytes,
  scryptSync,
  createCipheriv,
  createDecipheriv,
} from "node:crypto";
import { pipeline } from "node:stream/promises";
const root = process.cwd(),
  cfg = JSON.parse(
    fs.readFileSync(path.join(root, ".local-postgres/private.json"), "utf8"),
  );
const url = new URL(process.env.DATABASE_URL || "");
if (url.hostname !== "127.0.0.1" || url.port !== "55432")
  throw Error("Only existing local database backup is permitted");
const bin = path.join(
  root,
  ".local-postgres/runtime/embedded_postgres/pginstall/bin",
);
const folder = path.join(root, ".local-postgres/backups");
fs.mkdirSync(folder, { recursive: true });
const salt = randomBytes(16),
  nonce = randomBytes(12),
  key = scryptSync(cfg.superPassword, salt, 32),
  header = Buffer.concat([Buffer.from("HSY1541\n"), salt, nonce]);
const file = path.join(folder, "v154-before-" + Date.now() + ".dump.aes");
const stream = fs.createWriteStream(file, { flags: "wx" });
stream.write(header);
const dump = spawn(
  path.join(bin, "pg_dump.exe"),
  [
    "-Fc",
    "-h",
    "127.0.0.1",
    "-p",
    "55432",
    "-U",
    "postgres",
    "-d",
    decodeURIComponent(url.pathname.slice(1)),
  ],
  {
    env: { ...process.env, PGPASSWORD: cfg.superPassword },
    stdio: ["ignore", "pipe", "ignore"],
    windowsHide: true,
  },
);
const cipher = createCipheriv("aes-256-gcm", key, nonce);
await Promise.all([
  pipeline(dump.stdout, cipher, stream),
  new Promise((resolve, reject) => {
    dump.on("error", () => reject(Error("Backup process unavailable")));
    dump.on("exit", (c) =>
      c === 0 ? resolve() : reject(Error("Backup failed")),
    );
  }),
]);
fs.appendFileSync(file, cipher.getAuthTag());
// Verify authentication and archive signature without saving plaintext or restoring customer data.
const bytes = fs.readFileSync(file),
  decipher = createDecipheriv("aes-256-gcm", key, nonce);
decipher.setAuthTag(bytes.subarray(-16));
const plain = Buffer.concat([
  decipher.update(bytes.subarray(header.length, -16)),
  decipher.final(),
]);
if (plain.subarray(0, 5).toString() !== "PGDMP")
  throw Error("Archive header verification failed");
plain.fill(0);
key.fill(0);
console.log(
  JSON.stringify({
    encryptedBackup: file,
    authenticated: true,
    archiveHeaderVerified: true,
    restoreTested: false,
  }),
);
