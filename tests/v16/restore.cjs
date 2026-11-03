const fs = require("fs"),
  path = require("path"),
  assert = require("assert/strict"),
  { spawnSync } = require("child_process"),
  { randomUUID, createHash } = require("crypto");
const { Prisma } = require("@prisma/client"),
  { PrismaClient } = require("@hsy/sqlite-client");
const folder = path.resolve(".local-postgres/v16"),
  input = fs
    .readdirSync(path.join(folder, "backups"))
    .filter((n) => n.endsWith(".db.aes"))
    .sort()
    .pop(),
  output = path.join(folder, "restore-" + randomUUID() + "_test.sqlite");
assert.equal(process.env.DATABASE_PROVIDER, "sqlite");
const env = {
  ...process.env,
  BACKUP_ENCRYPTION_KEY_FILE: path.join(folder, "backup.key"),
  BACKUP_FILE: path.join(folder, "backups", input),
  RESTORE_DATABASE_FILE: output,
};
const restored = spawnSync(
  process.execPath,
  ["scripts/sqlite-backup.mjs", "restore"],
  { env, encoding: "utf8" },
);
assert.equal(restored.status, 0, "恢复失败，私有详情不输出");
const source = new PrismaClient({
    datasourceUrl: process.env.DATABASE_URL,
    log: [],
  }),
  target = new PrismaClient({
    datasourceUrl: "file:" + output.replaceAll("\\", "/"),
    log: [],
  });
const stable = (v) =>
  v instanceof Date
    ? v.toISOString()
    : Prisma.Decimal.isDecimal(v)
      ? v.toString()
      : Array.isArray(v)
        ? v.map(stable)
        : v && typeof v === "object"
          ? Object.fromEntries(
              Object.entries(v)
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([k, x]) => [k, stable(x)]),
            )
          : typeof v === "bigint"
            ? v.toString()
            : v;
(async () => {
  for (const model of Prisma.dmmf.datamodel.models) {
    const name = model.name[0].toLowerCase() + model.name.slice(1),
      fields = model.fields.filter((f) => f.kind !== "object"),
      pk =
        model.primaryKey?.fields ||
        fields.filter((f) => f.isId).map((f) => f.name),
      args = {
        select: Object.fromEntries(fields.map((f) => [f.name, true])),
        orderBy: pk.map((k) => ({ [k]: "asc" })),
      };
    const [a, b] = await Promise.all([
      source[name].findMany(args),
      target[name].findMany(args),
    ]);
    assert.equal(
      createHash("sha256")
        .update(JSON.stringify(stable(a)))
        .digest("hex"),
      createHash("sha256")
        .update(JSON.stringify(stable(b)))
        .digest("hex"),
      "恢复字段不一致：" + model.name,
    );
  }
  const corrupt = path.join(folder, "corrupt-" + randomUUID() + ".aes"),
    bad = fs.readFileSync(env.BACKUP_FILE);
  bad[21] ^= 1;
  fs.writeFileSync(corrupt, bad, { mode: 0o600 });
  const deniedFile = path.join(folder, "tamper-denied.sqlite");
  const denied = spawnSync(
    process.execPath,
    ["scripts/sqlite-backup.mjs", "restore"],
    {
      env: { ...env, BACKUP_FILE: corrupt, RESTORE_DATABASE_FILE: deniedFile },
      stdio: "pipe",
    },
  );
  assert.notEqual(denied.status, 0);
  assert.equal(fs.existsSync(deniedFile), false);
  fs.unlinkSync(corrupt);
  const result = {
    restored: true,
    allTables: Prisma.dmmf.datamodel.models.length,
    allFieldsMatch: true,
    corruptBackupRejected: true,
    sourcePreserved: true,
  };
  fs.writeFileSync(
    path.join(folder, "restore-result.json"),
    JSON.stringify(result, null, 2),
    { mode: 0o600 },
  );
  console.log(JSON.stringify(result));
  const cfg = fs
    .readFileSync(path.join(folder, "stage.env"), "utf8")
    .replaceAll("stage.sqlite", path.basename(output));
  fs.writeFileSync(path.join(folder, "workflow.env"), cfg, { mode: 0o600 });
})()
  .catch(() => {
    console.error("恢复演练校验失败，未输出字段数据");
    process.exitCode = 1;
  })
  .finally(async () => {
    await source.$disconnect();
    await target.$disconnect();
  });
