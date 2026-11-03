import { Prisma, PrismaClient } from "@prisma/client";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";
const JSON_NULL_MARKER = Symbol("json-null");
type Row = Record<string, unknown>;
type Client = Record<string, unknown>;
const load = createRequire(path.join(process.cwd(), "package.json"));
const models = Prisma.dmmf.datamodel.models;
let stage = "preflight";
const delegate = (client: Client, name: string) =>
  client[name[0].toLowerCase() + name.slice(1)] as Record<
    string,
    (arg?: unknown) => Promise<unknown>
  >;
const method = (client: Client, name: string, args: unknown[] = []) =>
  Reflect.apply(
    client[name] as (...args: unknown[]) => Promise<unknown>,
    client,
    args,
  );
function canonical(value: unknown): unknown {
  if (value && typeof value === "object" && JSON_NULL_MARKER in value)
    return { __nullKind: (value as Record<symbol, unknown>)[JSON_NULL_MARKER] };
  if (value instanceof Date) return value.toISOString();
  if (Prisma.Decimal.isDecimal(value)) return value.toString();
  if (typeof value === "bigint") return value.toString();
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => [k, canonical(v)]),
    );
  return value;
}
const hash = (rows: unknown) =>
  createHash("sha256")
    .update(JSON.stringify(canonical(rows)))
    .digest("hex");
const fields = (name: string) =>
  models
    .find((m) => m.name === name)!
    .fields.filter((f) => f.kind !== "object");
async function exportRows(client: Client, provider: string) {
  const data: Record<string, Row[]> = {};
  for (const model of models) {
    const scalar = fields(model.name),
      select = Object.fromEntries(scalar.map((f) => [f.name, true]));
    const pk =
      model.primaryKey?.fields ||
      scalar.filter((f) => f.isId).map((f) => f.name);
    assert.ok(pk.length, "每个模型必须有主键");
    const rows = (await delegate(client, model.name).findMany({
      select,
      orderBy: pk.map((k) => ({ [k]: "asc" })),
    })) as Row[];
    // Preserve SQL NULL versus JSON null, which Prisma reads as JS null for both.
    for (const field of scalar.filter(
      (f) => f.type === "Json" && f.isRequired === false,
    )) {
      const q = (s: string) =>
        provider === "mysql" ? "`" + s + "`" : '"' + s + '"';
      assert.ok(pk.length === 1, "可空JSON当前只适用于单主键表");
      const marks = (await method(client, "$queryRawUnsafe", [
        `SELECT ${q(pk[0])} AS id FROM ${q(model.dbName || model.name)} WHERE ${q(field.dbName || field.name)} IS NULL`,
      ])) as { id: unknown }[];
      const dbNull = new Set(marks.map((r) => r.id));
      for (const row of rows)
        if (row[field.name] === null)
          row[field.name] = {
            [JSON_NULL_MARKER]: dbNull.has(row[pk[0]]) ? "DB" : "JSON",
          };
    }
    rows.sort((a, b) => {
      const x = JSON.stringify(pk.map((k) => canonical(a[k]))),
        y = JSON.stringify(pk.map((k) => canonical(b[k])));
      return x < y ? -1 : x > y ? 1 : 0;
    });
    data[model.name] = rows;
  }
  return data;
}
function ordering() {
  const ordered: string[] = [],
    pending = new Set(models.map((m) => m.name));
  while (pending.size) {
    let moved = false;
    for (const name of pending) {
      const m = models.find((m) => m.name === name)!;
      const refs = m.fields
        .filter(
          (f) =>
            f.kind === "object" &&
            f.relationFromFields?.length &&
            f.relationFromFields.some(
              (n) => m.fields.find((x) => x.name === n)?.isRequired,
            ),
        )
        .map((f) => f.type);
      if (refs.every((r) => ordered.includes(r))) {
        ordered.push(name);
        pending.delete(name);
        moved = true;
      }
    }
    if (!moved) throw Error("存在必需关系循环，禁止猜测导入顺序。");
  }
  return ordered;
}
async function main() {
  assert.equal(
    process.env.MIGRATION_WRITES_FROZEN,
    "true",
    "须先暂停本项目写入，不能冻结其他站点",
  );
  const from = process.env.MIGRATION_FROM || "postgresql",
    to = process.env.MIGRATION_TO || "sqlite";
  assert.ok(
    (from === "postgresql" && to === "sqlite") ||
      (from === "sqlite" && to === "mysql"),
  );
  const sourceUrl =
      process.env.MIGRATION_SOURCE_URL || process.env.DATABASE_URL!,
    targetUrl = process.env.MIGRATION_TARGET_URL!;
  assert.ok(targetUrl && sourceUrl && targetUrl !== sourceUrl);
  if (from === "postgresql")
    assert.ok(
      ["localhost", "127.0.0.1"].includes(new URL(sourceUrl).hostname),
      "本期仅授权读取本地PostgreSQL",
    );
  if (to === "mysql")
    assert.ok(
      process.env.MYSQL_PRODUCTION_APPROVED === "true" ||
        (process.env.MYSQL_LOCAL_TEST_MODE === "true" &&
          ["localhost", "127.0.0.1"].includes(new URL(targetUrl).hostname)),
      "未授权连接MySQL",
    );
  assert.ok(
    process.env.SOURCE_BACKUP_FILE &&
      fs.statSync(process.env.SOURCE_BACKUP_FILE).size > 100,
    "迁移前必须有私有加密备份",
  );
  const backupFile = process.env.SOURCE_BACKUP_FILE!;
  const descriptor = fs.openSync(backupFile, "r");
  const header = Buffer.alloc(8);
  try {
    fs.readSync(descriptor, header, 0, 8, 0);
  } finally {
    fs.closeSync(descriptor);
  }
  assert.equal(
    header.toString(),
    from === "postgresql" ? "HSY1541\n" : "HSYSQL16",
    "必须使用本项目的加密备份",
  );
  assert.ok(
    Date.now() - fs.statSync(backupFile).mtimeMs < 86400000,
    "须在迁移前24小时内重新备份",
  );
  if (to === "mysql") {
    const dbName = decodeURIComponent(new URL(targetUrl).pathname.slice(1));
    assert.ok(
      /^hushangyin_[a-zA-Z0-9_]+$/.test(dbName),
      "只允许沪上银独立数据库，禁止共享其他业务数据库",
    );
  }
  if (to === "sqlite") {
    const file = targetUrl.replace(/^file:/, "").split("?")[0];
    assert.ok(
      path.isAbsolute(file) &&
        !/(^|[\\/])(public|\.next|tmp)([\\/]|$)/.test(file),
    );
    process.umask(0o077);
  }
  const source =
    from === "postgresql"
      ? new PrismaClient({ datasourceUrl: sourceUrl, log: [] })
      : new (load("@hsy/sqlite-client").PrismaClient)({
          datasourceUrl: sourceUrl,
          log: [],
        });
  const Target = load(
    to === "sqlite" ? "@hsy/sqlite-client" : "@hsy/mysql-client",
  );
  const target = new Target.PrismaClient({
    datasourceUrl: targetUrl,
    log: [],
  }) as Client;
  try {
    for (const m of models)
      assert.equal(
        await delegate(target, m.name).count(),
        0,
        "目标非空，拒绝覆盖任何现有数据",
      );
    const snapshot =
      from === "postgresql"
        ? await source.$transaction(
            async (tx: Prisma.TransactionClient) => {
              await tx.$executeRaw`SET TRANSACTION READ ONLY`;
              return exportRows(tx as unknown as Client, from);
            },
            { isolationLevel: "RepeatableRead", timeout: 120000 },
          )
        : ((await method(source, "$transaction", [
            (tx: Client) => exportRows(tx, from),
            { timeout: 120000 },
          ])) as Record<string, Row[]>);
    const pending: { model: string; where: Row; data: Row }[] = [];
    await method(target, "$transaction", [
      async (tx: Client) => {
        for (const name of ordering()) {
          stage = "import:" + name;
          const model = models.find((m) => m.name === name)!,
            scalar = fields(name),
            pk =
              model.primaryKey?.fields ||
              scalar.filter((f) => f.isId).map((f) => f.name);
          const optional = new Set(
            model.fields
              .filter(
                (f) => f.kind === "object" && f.relationFromFields?.length,
              )
              .flatMap((f) => f.relationFromFields || [])
              .filter(
                (n) => !model.fields.find((f) => f.name === n)!.isRequired,
              ),
          );
          for (const row of snapshot[name]) {
            const data: Row = {},
              later: Row = {};
            for (const f of scalar) {
              let v = row[f.name];
              if (
                f.type === "Json" &&
                v &&
                typeof v === "object" &&
                JSON_NULL_MARKER in v
              )
                v =
                  (v as Record<symbol, unknown>)[JSON_NULL_MARKER] === "DB"
                    ? Target.Prisma.DbNull
                    : Target.Prisma.JsonNull;
              if (optional.has(f.name) && v !== null) {
                later[f.name] = v;
                data[f.name] = null;
              } else data[f.name] = v;
            }
            await delegate(tx, name).create({ data });
            if (Object.keys(later).length) {
              if ("updatedAt" in row) later.updatedAt = row.updatedAt;
              const key = Object.fromEntries(pk.map((k) => [k, row[k]]));
              pending.push({
                model: name,
                where: pk.length === 1 ? key : { [pk.join("_")]: key },
                data: later,
              });
            }
          }
        }
        for (const patch of pending) {
          stage = "relations:" + patch.model;
          await delegate(tx, patch.model).update({
            where: patch.where,
            data: patch.data,
          });
        }
        stage = "verify";
        const copied = await exportRows(tx, to);
        for (const m of models) {
          stage = "verify:" + m.name;
          if (hash(copied[m.name]) !== hash(snapshot[m.name])) {
            const sourceRows = snapshot[m.name],
              targetRows = copied[m.name];
            const differences = new Set<string>();
            for (let i = 0; i < sourceRows.length; i++)
              for (const key of Object.keys(sourceRows[i]))
                if (hash(sourceRows[i][key]) !== hash(targetRows[i]?.[key]))
                  differences.add(key);
            console.error(
              JSON.stringify({ stage, differentFields: [...differences] }),
            );
          }
          assert.equal(
            hash(copied[m.name]),
            hash(snapshot[m.name]),
            "逐表完整字段校验不一致，事务回滚：" + m.name,
          );
        }
      },
      { timeout: 180000 },
    ]);
    if (to === "sqlite") {
      const integrity = (await method(target, "$queryRawUnsafe", [
        "PRAGMA integrity_check",
      ])) as Row[];
      assert.equal(Object.values(integrity[0])[0], "ok");
      assert.deepEqual(
        await method(target, "$queryRawUnsafe", ["PRAGMA foreign_key_check"]),
        [],
      );
      await method(target, "$queryRawUnsafe", ["PRAGMA journal_mode=WAL"]);
    }
    const report = {
      from,
      to,
      allTablesVerified: true,
      tableCount: models.length,
      tables: models.map((m) => ({
        model: m.name,
        rows: snapshot[m.name].length,
        sha256: hash(snapshot[m.name]),
      })),
      sourceUnmodified: true,
      completedAt: new Date().toISOString(),
    };
    const output =
      process.env.MIGRATION_REPORT_FILE ||
      ".local-postgres/v16/migration-result.json";
    fs.mkdirSync(path.dirname(output), { recursive: true, mode: 0o700 });
    fs.writeFileSync(output, JSON.stringify(report, null, 2), { mode: 0o600 });
    console.log(
      JSON.stringify({
        from,
        to,
        tableCount: models.length,
        allTablesVerified: true,
        sourceUnmodified: true,
      }),
    );
  } finally {
    await source.$disconnect();
    await method(target, "$disconnect");
  }
}
main().catch((e) => {
  console.error(
    JSON.stringify({
      message: "迁移未完成；禁止清空源库或覆盖目标库。",
      stage,
      code:
        typeof e?.code === "string" && /^(P\d+|ERR_ASSERTION)$/.test(e.code)
          ? e.code
          : "VALIDATION_OR_IO",
    }),
  );
  process.exitCode = 1;
});
