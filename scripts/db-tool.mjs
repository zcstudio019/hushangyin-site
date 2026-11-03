import { spawnSync } from "node:child_process";
import path from "node:path";
import fs from "node:fs";
const action = process.argv[2],
  selected = process.argv[3] || process.env.DATABASE_PROVIDER || "postgresql";
if (
  !["generate", "validate", "deploy"].includes(action) ||
  !["postgresql", "sqlite", "mysql", "all"].includes(selected) ||
  (action === "deploy" && selected === "all")
)
  throw Error("请选择单一数据库迁移；允许 generate/validate all。");
for (const p of selected === "all"
  ? ["postgresql", "sqlite", "mysql"]
  : [selected]) {
  const env = { ...process.env };
  if (p !== "postgresql") {
    const key = p.toUpperCase() + "_DATABASE_URL";
    env[key] ||=
      action === "deploy"
        ? process.env.DATABASE_URL
        : p === "sqlite"
          ? "file:" +
            path
              .resolve(".local-postgres/v16/validation.sqlite")
              .replaceAll("\\", "/")
          : "mysql://validation_only:unused@127.0.0.1:3306/validation_only";
    if (!env[key]) throw Error("数据库私密配置缺失。");
    if (action === "deploy" && p === "sqlite") {
      const file = env[key].replace(/^file:/, "").split("?")[0];
      if (
        !path.isAbsolute(file) ||
        /(^|[\\/])(public|\.next|tmp)([\\/]|$)/i.test(file)
      )
        throw Error("SQLite必须在私有绝对路径。");
      if (!fs.existsSync(file)) fs.closeSync(fs.openSync(file, "wx", 0o600));
    }
    if (
      action === "deploy" &&
      p === "mysql" &&
      process.env.MYSQL_PRODUCTION_APPROVED !== "true" &&
      !(
        process.env.MYSQL_LOCAL_TEST_MODE === "true" &&
        ["localhost", "127.0.0.1"].includes(new URL(env[key]).hostname)
      )
    )
      throw Error("尚未授权连接MySQL。");
  }
  if (action === "deploy" && p === "mysql") {
    const name = decodeURIComponent(
      new URL(env.MYSQL_DATABASE_URL).pathname.slice(1),
    );
    if (!/^hushangyin_[a-zA-Z0-9_]+$/.test(name))
      throw Error("只允许沪上银独立MySQL数据库。");
  }
  const schema =
    p === "postgresql" ? "prisma/schema.prisma" : `prisma/${p}/schema.prisma`;
  const args = action === "deploy" ? ["migrate", "deploy"] : [action];
  const r = spawnSync(
    process.execPath,
    ["node_modules/prisma/build/index.js", ...args, "--schema", schema],
    { env, stdio: "inherit", windowsHide: true },
  );
  if (r.status !== 0) process.exit(r.status || 1);
}
