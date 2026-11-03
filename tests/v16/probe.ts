import { db } from "../../src/lib/db";
(async () => {
  const p = db();
  console.log(
    JSON.stringify(
      {
        users: await p.adminUser.count(),
        questions: await p.geoQuestion.count(),
        faqs: await p.faq.count(),
        sqlite: await p.$queryRaw`PRAGMA journal_mode`,
        foreignKeys: await p.$queryRaw`PRAGMA foreign_keys`,
        busy: await p.$queryRaw`PRAGMA busy_timeout`,
      },
      (_, v) => (typeof v === "bigint" ? Number(v) : v),
    ),
  );
  await p.$disconnect();
})().catch(() => {
  console.error("SQLite运行检查失败，未输出数据库内容。");
  process.exitCode = 1;
});
