import { createDatabaseClient } from "../src/lib/db/provider";
import { publicAiConfiguration } from "../src/lib/ai/provider";

import { hostname } from "node:os";
import {
  claimTask,
  executeTask,
  recoverExpired,
} from "../src/features/generation/worker";
if (process.argv.includes("--check-config")) {
  console.log(JSON.stringify(publicAiConfiguration()));
  process.exit(0);
}
const client = createDatabaseClient();
const workerId = (hostname() + ":" + process.pid).slice(0, 80);
let stopping = false;
process.on("SIGINT", () => {
  stopping = true;
});
process.on("SIGTERM", () => {
  stopping = true;
});
async function main() {
  console.log("内容生成执行器已启动；仅执行数据库中的授权任务。");
  const heartbeat = setInterval(() => {
    void client.generationWorkerHeartbeat
      .upsert({
        where: { id: workerId },
        create: { id: workerId, lastSeenAt: new Date() },
        update: { lastSeenAt: new Date() },
      })
      .catch(() => {});
  }, 15000);
  try {
    while (!stopping) {
      try {
        await client.generationWorkerHeartbeat.upsert({
          where: { id: workerId },
          create: { id: workerId, lastSeenAt: new Date() },
          update: { lastSeenAt: new Date() },
        });
        await recoverExpired(client);
        const task = await claimTask(client);
        if (task) await executeTask(client, task);
        else await new Promise((r) => setTimeout(r, 2000));
      } catch {
        console.error("内容生成执行器暂不可用，将重试；未记录请求内容。");
        await new Promise((r) => setTimeout(r, 5000));
      }
    }
  } finally {
    clearInterval(heartbeat);
  }
  await client.generationWorkerHeartbeat.deleteMany({
    where: { id: workerId },
  });
}
main().finally(() => client.$disconnect());
