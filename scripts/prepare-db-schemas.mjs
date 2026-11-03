// PostgreSQL stays the authoritative local schema; provider copies are deterministic.
import fs from "node:fs";
const original = fs.readFileSync("prisma/schema.prisma", "utf8");
for (const provider of ["sqlite", "mysql"]) {
  let schema = original
    .replace(
      'provider = "prisma-client-js"',
      `provider = "prisma-client-js"\n  output = "../../node_modules/@hsy/${provider}-client"`,
    )
    .replace('provider = "postgresql"', `provider = "${provider}"`)
    .replace(/String\[\](\s+)@default\(\[\]\)/g, 'Json$1@default("[]")');
  schema = schema.replace(
    'env("DATABASE_URL")',
    `env("${provider.toUpperCase()}_DATABASE_URL")`,
  );
  if (provider === "sqlite")
    schema = schema.replace(/\s+@db\.\w+(?:\([^)]*\))?/g, "");
  else schema = schema.replace(/@db\.Timestamptz\(3\)/g, "@db.DateTime(3)");
  schema +=
    '\nmodel DeploymentWriteLock {\n id Int @id\n epoch Int @default(0)\n @@map("deployment_write_lock")\n}\n';
  fs.mkdirSync(`prisma/${provider}`, { recursive: true });
  fs.writeFileSync(`prisma/${provider}/schema.prisma`, schema);
}
console.log("SQLite/MySQL Schema已按当前本地Schema生成；未连接数据库。");
