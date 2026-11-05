import fs from "node:fs";
import { parseEnv } from "node:util";
import { DatabaseSync } from "node:sqlite";
import { createHash } from "node:crypto";

const origin = "https://hushangyin.linhongtech.com";
const database = "/var/lib/hushangyin/production.sqlite";
const databaseUrl = "file:" + database;
const required = {
  NODE_ENV: "production",
  SITE_URL: origin,
  LOCAL_TEST_MODE: "false",
  DATABASE_PROVIDER: "sqlite",
  DATABASE_URL: databaseUrl,
  SQLITE_DATABASE_URL: databaseUrl,
  PORT: "3120",
  TRUST_PROXY: "true",
  ...Object.fromEntries([
    "CONSULTATIONS_ENABLED", "PRODUCTION_CONSULTATIONS_APPROVED",
    "ANALYTICS_ENABLED", "ANALYTICS_PRODUCTION_APPROVED",
    "ANALYTICS_MAINTENANCE_APPROVED", "AI_GENERATION_ENABLED",
    "AI_EXTERNAL_TRANSMISSION_APPROVED", "GEO_WORKER_ENABLED",
    "MYSQL_PRODUCTION_APPROVED", "MYSQL_LOCAL_TEST_MODE",
  ].map((key) => [key, "false"])),
};

function requireCondition(ok, message) {
  if (!ok) throw Error(message);
}

function config(file, keys) {
  const stat = fs.lstatSync(file);
  requireCondition(stat.isFile() && stat.uid === 0 && (stat.mode & 0o777) === 0o640,
    "Expected regular root-owned 0640 environment file.");
  const content = fs.readFileSync(file, "utf8");
  const seen = new Set();
  for (const line of content.split("\n")) {
    if (/^\s*(#.*)?$/.test(line)) continue;
    const match = /^([A-Z_]+)=[A-Za-z0-9_:/.-]*$/.exec(line);
    requireCondition(match && keys.includes(match[1]) && !seen.has(match[1]),
      "Unexpected, repeated or unsupported environment setting.");
    seen.add(match[1]);
  }
  return parseEnv(content);
}

function checkConfig(appFile, backupFile) {
  const app = config(appFile, [...Object.keys(required), "SESSION_SECRET", "RATE_LIMIT_SECRET",
    "AI_PROVIDER", "AI_BASE_URL", "AI_MODEL", "AI_REASONING_EFFORT", "AI_API_KEY", "MYSQL_DATABASE_URL"]);
  for (const [key, value] of Object.entries(required))
    requireCondition(app[key] === value, "Unexpected production setting: " + key);
  for (const key of ["SESSION_SECRET", "RATE_LIMIT_SECRET"])
    requireCondition(/^[A-Za-z0-9_-]{32,}$/.test(app[key] || ""), "Missing or invalid " + key);
  requireCondition(app.SESSION_SECRET !== app.RATE_LIMIT_SECRET, "Use distinct secrets.");
  requireCondition(!app.AI_API_KEY && !app.MYSQL_DATABASE_URL, "External credentials must remain empty.");
  const backup = config(backupFile, ["DATABASE_URL", "SQLITE_BACKUP_DIR",
    "BACKUP_ENCRYPTION_KEY_FILE", "BACKUP_RETENTION_DAYS", "OSS_BACKUP_ENABLED", "OSS_BACKUP_DESTINATION"]);
  requireCondition(backup.DATABASE_URL === databaseUrl &&
    backup.SQLITE_BACKUP_DIR === "/var/backups/hushangyin/production" &&
    backup.BACKUP_ENCRYPTION_KEY_FILE === "/etc/hushangyin/backup.key" &&
    backup.OSS_BACKUP_ENABLED === "false" && !backup.OSS_BACKUP_DESTINATION &&
    /^\d{1,3}$/.test(backup.BACKUP_RETENTION_DAYS || "") &&
    Number(backup.BACKUP_RETENTION_DAYS) >= 7 && Number(backup.BACKUP_RETENTION_DAYS) <= 365,
    "Backup must target production SQLite and its dedicated local backup directory.");
}

function checkDatabase(initializing) {
  requireCondition(fs.realpathSync("/var/lib/hushangyin") === "/var/lib/hushangyin",
    "Database directory must not be redirected.");
  const key = fs.lstatSync("/etc/hushangyin/backup.key");
  requireCondition(key.isFile() && key.uid === process.getuid() &&
    (key.mode & 0o777) === 0o600 && key.size === 32, "Invalid private backup key.");
  for (const suffix of ["", "-wal", "-shm", "-journal"]) {
    const file = database + suffix;
    const stat = fs.lstatSync(file, { throwIfNoEntry: false });
    if (initializing) {
      requireCondition(!stat, "Production database or SQLite sidecar already exists.");
      continue;
    }
    if (!stat && suffix) continue;
    requireCondition(stat?.isFile() && stat.nlink === 1 && stat.uid === process.getuid() &&
      (stat.mode & 0o777) === 0o600, "Production SQLite must be a private 0600 service-owned file.");
  }
}

function verifyDatabase(configureWal) {
  checkDatabase(false);
  const db = new DatabaseSync(database, { readOnly: !configureWal, timeout: 5000 });
  try {
    const pragma = configureWal ? "journal_mode=WAL" : "journal_mode";
    requireCondition(db.prepare("PRAGMA " + pragma).get().journal_mode === "wal", "SQLite WAL is required.");
    const integrity = db.prepare("PRAGMA integrity_check").all();
    requireCondition(integrity.length === 1 && integrity[0].integrity_check === "ok" &&
      db.prepare("PRAGMA foreign_key_check").all().length === 0, "SQLite integrity check failed.");
    requireCondition(db.prepare("SELECT 1 FROM deployment_write_lock WHERE id=1").get(),
      "SQLite transaction lock row is missing.");
    if (!configureWal) {
      const applied = db.prepare("SELECT migration_name, checksum FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL").all();
      const folders = fs.readdirSync("prisma/sqlite/migrations", { withFileTypes: true }).filter((item) => item.isDirectory());
      requireCondition(applied.length === folders.length && folders.every(({ name }) => {
        const checksum = createHash("sha256")
          .update(fs.readFileSync("prisma/sqlite/migrations/" + name + "/migration.sql")).digest("hex");
        return applied.some((row) => row.migration_name === name && row.checksum === checksum);
      }), "SQLite migration history or checksums differ. Review before deployment.");
      requireCondition(db.prepare("SELECT 1 FROM admin_users WHERE role='SUPER_ADMIN' AND isActive=1").get(),
        "Create an active production super administrator before activation.");
    }
  } finally {
    db.close();
  }
}

try {
  const [mode, a, b] = process.argv.slice(2);
  if (mode === "config") checkConfig(a, b);
  else if (mode === "new-db") {
    checkDatabase(true);
    fs.closeSync(fs.openSync(database, "wx", 0o600));
  } else if (mode === "wal" || mode === "database") verifyDatabase(mode === "wal");
  else throw Error("Unknown production check.");
} catch (error) {
  // Never print environment values, SQL payloads or native exceptions.
  console.error(error.constructor === Error && !error.code ? error.message : "Production configuration or SQLite check failed.");
  process.exitCode = 1;
}
