import { db } from "../../src/lib/db";
const key = process.env.V16_TEST_COUNTER!;
if (
  process.env.DATABASE_PROVIDER !== "sqlite" ||
  !key?.startsWith("v16-counter-")
)
  throw Error("ISOLATED_SQLITE_TEST_REQUIRED");
(async () => {
  const p = db();
  for (let i = 0; i < 20; i++)
    await p.$transaction(async (tx) => {
      const old = await tx.rateLimitBucket.findUniqueOrThrow({
        where: { key },
      });
      await new Promise((r) => setTimeout(r, 5));
      await tx.rateLimitBucket.update({
        where: { key },
        data: { count: old.count + 1 },
      });
    });
  await p.$disconnect();
})().catch(() => {
  console.error("隔离SQLite并发写入未完成");
  process.exitCode = 1;
});
