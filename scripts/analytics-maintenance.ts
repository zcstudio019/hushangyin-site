import { db } from "../src/lib/db";
import { retainAnalytics } from "../src/features/analytics/retention";
if (
  process.env.LOCAL_TEST_MODE !== "true" &&
  process.env.ANALYTICS_MAINTENANCE_APPROVED !== "true"
)
  throw Error("请先由运维明确批准分析数据保留任务；不会删除客户线索。");
db()
  .$transaction((tx) => retainAnalytics(tx), { timeout: 30000 })
  .then((result) => console.log(JSON.stringify(result)))
  .finally(() => db().$disconnect());
