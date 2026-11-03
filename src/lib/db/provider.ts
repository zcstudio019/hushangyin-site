import { PrismaClient, Prisma } from "@prisma/client";
import * as SqliteModule from "@hsy/sqlite-client";
import * as MysqlModule from "@hsy/mysql-client";
import path from "node:path";
export type DatabaseProvider = "postgresql" | "sqlite" | "mysql";
export function isolatedTestDatabase() {
  const value = process.env.DATABASE_URL || "";
  if (value.startsWith("file:"))
    return (
      process.env.DATABASE_PROVIDER === "sqlite" &&
      process.env.LOCAL_TEST_MODE === "true" &&
      value.split("?")[0].endsWith("_test.sqlite")
    );
  try {
    const u = new URL(value);
    return (
      ["localhost", "127.0.0.1"].includes(u.hostname) &&
      u.pathname.endsWith("_test")
    );
  } catch {
    return false;
  }
}
export function databaseProvider(): DatabaseProvider {
  const p = process.env.DATABASE_PROVIDER || "postgresql";
  if (!["postgresql", "sqlite", "mysql"].includes(p))
    throw Error("DATABASE_PROVIDER_INVALID");
  return p as DatabaseProvider;
}
type Native = Record<string, unknown>;
type Operation = { run: (client: Native) => Promise<unknown> };
const operation = Symbol("database-operation");
function lazy(run: Operation["run"], client: Native) {
  return {
    [operation]: { run },
    then: (
      yes?: ((v: unknown) => unknown) | null,
      no?: ((e: unknown) => unknown) | null,
    ) => run(client).then(yes, no),
  };
}
function quote(name: string, p: DatabaseProvider) {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name))
    throw Error("DATABASE_IDENTIFIER_INVALID");
  return p === "mysql" ? "`" + name + "`" : '"' + name + '"';
}
const models = Object.fromEntries(
  Prisma.dmmf.datamodel.models.map((m) => [
    m.name[0].toLowerCase() + m.name.slice(1),
    m,
  ]),
);
export function createDatabaseClient(
  url = process.env.DATABASE_URL,
  provider = databaseProvider(),
): PrismaClient {
  if (!url) throw Error("DATABASE_UNAVAILABLE");
  if (provider === "postgresql") {
    if (!/^postgres(?:ql)?:/.test(url))
      throw Error("DATABASE_PROVIDER_URL_MISMATCH");
    return new PrismaClient({ datasourceUrl: url, log: [] });
  }
  if (provider === "sqlite") {
    const file = decodeURIComponent(url.replace(/^file:/, "").split("?")[0]);
    if (
      !url.startsWith("file:") ||
      !path.isAbsolute(file) ||
      /(^|[\\/])(public|\.next|tmp)([\\/]|$)/i.test(file)
    )
      throw Error("SQLITE_PRIVATE_ABSOLUTE_PATH_REQUIRED");
    if (
      process.env.LOCAL_TEST_MODE !== "true" &&
      !file.startsWith("/var/lib/hushangyin/")
    )
      throw Error("SQLITE_PRODUCTION_PATH_NOT_APPROVED");
    url = fileUrl(url);
  } else {
    const mysqlUrl = new URL(url);
    if (mysqlUrl.protocol !== "mysql:")
      throw Error("DATABASE_PROVIDER_URL_MISMATCH");
    mysqlUrl.searchParams.set("connection_limit", "1");
    url = mysqlUrl.toString();
    const host = mysqlUrl.hostname;
    if (
      process.env.MYSQL_PRODUCTION_APPROVED !== "true" &&
      !(
        ["127.0.0.1", "localhost"].includes(host) &&
        process.env.MYSQL_LOCAL_TEST_MODE === "true"
      )
    )
      throw Error("MYSQL_CONNECTION_NOT_APPROVED");
  }
  const Module = (provider === "sqlite"
    ? SqliteModule
    : MysqlModule) as unknown as {
    PrismaClient: new (options: unknown) => Native;
    Prisma: { DbNull: unknown; JsonNull: unknown; AnyNull: unknown };
  };
  function translate(v: unknown): unknown {
    if (v === Prisma.DbNull) return Module.Prisma.DbNull;
    if (v === Prisma.JsonNull) return Module.Prisma.JsonNull;
    if (v === Prisma.AnyNull) return Module.Prisma.AnyNull;
    if (Array.isArray(v)) return v.map(translate);
    if (
      v &&
      typeof v === "object" &&
      Object.getPrototypeOf(v) === Object.prototype
    )
      return Object.fromEntries(
        Object.entries(v).map(([k, x]) => [k, translate(x)]),
      );
    return v;
  }
  function converted(e: unknown): never {
    if (e instanceof Prisma.PrismaClientKnownRequestError) throw e;
    const err = e as { code?: string };
    if (/^P[0-9]{4}$/.test(err?.code || ""))
      throw new Prisma.PrismaClientKnownRequestError("数据库操作未完成。", {
        code: err.code!,
        clientVersion: Prisma.prismaVersion.client,
      });
    throw e;
  }
  const base = new Module.PrismaClient({ datasourceUrl: url, log: [] });
  const invoke = (client: Native, key: string, args: unknown[]) =>
    Reflect.apply(
      client[key] as (...args: unknown[]) => Promise<unknown>,
      client,
      args,
    );
  let ready: Promise<void> | undefined;
  async function init() {
    if (!ready)
      ready = (async () => {
        if (provider === "sqlite") {
          await invoke(base, "$queryRawUnsafe", ["PRAGMA journal_mode=WAL"]);
          await invoke(base, "$queryRawUnsafe", ["PRAGMA busy_timeout=5000"]);
          await invoke(base, "$queryRawUnsafe", ["PRAGMA foreign_keys=ON"]);
          await invoke(base, "$queryRawUnsafe", ["PRAGMA synchronous=FULL"]);
          await invoke(base, "$queryRawUnsafe", [
            "PRAGMA wal_autocheckpoint=1000",
          ]);
        } else {
          await invoke(base, "$executeRawUnsafe", ["SET time_zone = '+00:00'"]);
        }
      })().catch((error) => {
        ready = undefined;
        throw error;
      });
    return ready;
  }
  async function normal(
    where: unknown,
    modelName: string,
    client: Native,
  ): Promise<unknown> {
    if (
      !where ||
      typeof where !== "object" ||
      where instanceof Date ||
      Array.isArray(where)
    )
      return Array.isArray(where)
        ? Promise.all(where.map((w) => normal(w, modelName, client)))
        : where;
    const value = where as Record<string, unknown>,
      out: Record<string, unknown> = {},
      conditions: unknown[] = [];
    const model = models[modelName];
    for (const [key, v] of Object.entries(value)) {
      const f = model?.fields.find((f) => f.name === key);
      const filter =
        v && typeof v === "object" && !Array.isArray(v)
          ? (v as Record<string, unknown>)
          : null;
      if (
        f &&
        filter &&
        (filter.path ||
          filter.has !== undefined ||
          filter.mode === "insensitive")
      ) {
        const table = Prisma.raw(quote(model.dbName || model.name, provider)),
          field = Prisma.raw(quote(f.dbName || f.name, provider));
        let expression: Prisma.Sql;
        if (filter.path) {
          const parts = filter.path;
          if (
            !Array.isArray(parts) ||
            !parts.every(
              (x) => typeof x === "string" && /^[a-zA-Z0-9_]+$/.test(x),
            ) ||
            !("equals" in filter)
          )
            throw Error("JSON_FILTER_UNSUPPORTED");
          const jsonPath = "$." + parts.join(".");
          expression =
            provider === "sqlite"
              ? Prisma.sql`json_extract(${field},${jsonPath}) = ${filter.equals}`
              : Prisma.sql`JSON_UNQUOTE(JSON_EXTRACT(${field},${jsonPath})) = ${String(filter.equals)}`;
        } else if (filter.has !== undefined)
          expression =
            provider === "sqlite"
              ? Prisma.sql`EXISTS (SELECT 1 FROM json_each(${field}) WHERE value=${filter.has})`
              : Prisma.sql`JSON_CONTAINS(${field},${JSON.stringify(filter.has)})`;
        else if (typeof filter.contains === "string")
          expression =
            provider === "sqlite"
              ? Prisma.sql`instr(lower(${field}),lower(${filter.contains}))>0`
              : Prisma.sql`LOCATE(lower(${filter.contains}),lower(${field}))>0`;
        else throw Error("CASE_FILTER_UNSUPPORTED");
        const rows = (await invoke(client, "$queryRaw", [
          Prisma.sql`SELECT id FROM ${table} WHERE ${expression}`,
        ])) as { id: string }[];
        conditions.push({ id: { in: rows.map((r) => r.id) } });
      } else
        out[key] = ["AND", "OR", "NOT"].includes(key)
          ? await normal(v, modelName, client)
          : v;
    }
    if (conditions.length) {
      out.AND = [
        ...(Array.isArray(out.AND) ? out.AND : out.AND ? [out.AND] : []),
        ...conditions,
      ];
    }
    return out;
  }
  async function execute(
    client: Native,
    model: string,
    method: string,
    args: unknown[],
  ) {
    await init();
    const delegate = client[model] as Native;
    const arg =
      args[0] && typeof args[0] === "object"
        ? { ...(args[0] as Record<string, unknown>) }
        : undefined;
    if (arg?.where) arg.where = await normal(arg.where, model, client);
    if (method === "createMany" && arg?.skipDuplicates) {
      const data = Array.isArray(arg.data) ? arg.data : [arg.data];
      let count = 0;
      for (const row of data)
        try {
          await invoke(delegate, "create", [{ data: translate(row) }]);
          count++;
        } catch (e) {
          if ((e as { code?: string })?.code !== "P2002") converted(e);
        }
      return { count };
    }
    return invoke(
      delegate,
      method,
      translate(arg ? [arg, ...args.slice(1)] : args) as unknown[],
    ).catch(converted);
  }
  async function lock(tx: Native) {
    await invoke(tx, "$executeRawUnsafe", [
      "UPDATE deployment_write_lock SET epoch=epoch+1 WHERE id=1",
    ]);
  }
  const wrap = (client: Native, transaction = false): Native =>
    new Proxy(client, {
      get(target, key) {
        if (key === "$transaction" && !transaction)
          return async (
            work: unknown,
            options: Record<string, unknown> = {},
          ) => {
            await init();
            return invoke(base, "$transaction", [
              async (tx: Native) => {
                await lock(tx);
                if (Array.isArray(work)) {
                  const values = [];
                  for (const item of work) {
                    const op = item?.[operation] as Operation | undefined;
                    if (!op)
                      throw Error("DATABASE_TRANSACTION_OPERATION_REQUIRED");
                    values.push(await op.run(tx));
                  }
                  return values;
                }
                return (work as (tx: unknown) => Promise<unknown>)(
                  wrap(tx, true),
                );
              },
              { maxWait: 10000, timeout: 30000, ...options },
            ]).catch(converted);
          };
        if (key === "$connect") return init;
        if (key === "$disconnect") return () => invoke(base, "$disconnect", []);
        if (key === "$queryRaw" || key === "$executeRaw")
          return (...args: unknown[]) =>
            lazy(async (native) => {
              await init();
              const first = args[0] as { strings?: string[] } | string[];
              const text = (
                Array.isArray(first) ? first : first?.strings || []
              ).join(" ");
              if (/pg_advisory_xact_lock|FOR SHARE|FOR UPDATE/.test(text)) {
                if (!transaction)
                  throw Error("DATABASE_LOCK_REQUIRES_TRANSACTION");
                return key === "$queryRaw" ? [] : 0;
              }
              if (/to_tsvector|AT TIME ZONE|::|->>|jsonb/i.test(text))
                throw Error("DATABASE_SQL_NOT_PORTABLE");
              return invoke(native, String(key), args);
            }, client);
        if (typeof key === "string" && models[key])
          return new Proxy(target[key] as Native, {
            get(delegate, method) {
              if (typeof delegate[method as string] !== "function")
                return delegate[method as string];
              return (...args: unknown[]) =>
                lazy(
                  (native) => execute(native, key, String(method), args),
                  client,
                );
            },
          });
        const v = Reflect.get(target, key);
        return typeof v === "function" ? v.bind(target) : v;
      },
    });
  return wrap(base) as unknown as PrismaClient;
}
function fileUrl(url: string) {
  const [file, search = ""] = url.split("?"),
    q = new URLSearchParams(search);
  q.set("connection_limit", "1");
  q.set("socket_timeout", "10");
  return file + "?" + q;
}
