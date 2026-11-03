import { db } from "../../src/lib/db";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
(async () => {
  const p = db(),
    key = "v16-counter-" + randomUUID();
  assert.equal(process.env.DATABASE_PROVIDER, "sqlite");
  await p.rateLimitBucket.create({
    data: { key, count: 0, expiresAt: new Date(Date.now() + 60000) },
  });
  try {
    const run = () =>
      new Promise<number | null>((resolve, reject) => {
        const child = spawn(
          process.execPath,
          [
            "--conditions=react-server",
            "--import",
            "tsx",
            "tests/v16/writer.ts",
          ],
          {
            env: { ...process.env, V16_TEST_COUNTER: key },
            stdio: "pipe",
            windowsHide: true,
          },
        );
        child.on("error", reject);
        child.on("exit", resolve);
      });
    const codes = await Promise.all([run(), run()]);
    assert.deepEqual(codes, [0, 0]);
    assert.equal(
      (await p.rateLimitBucket.findUniqueOrThrow({ where: { key } })).count,
      40,
    );
    console.log(
      JSON.stringify({
        separateProcesses: 2,
        committedWrites: 40,
        lostUpdates: 0,
        sharedSQLiteFile: true,
      }),
    );
  } finally {
    await p.rateLimitBucket.delete({ where: { key } });
    await p.$disconnect();
  }
})().catch(() => {
  console.error("SQLite并发事务校验失败");
  process.exitCode = 1;
});
