import "server-only";
import type { Prisma } from "@prisma/client";
export async function retainAnalytics(
  tx: Prisma.TransactionClient,
  now = new Date(),
) {
  const ago = (days: number) => new Date(now.getTime() - days * 86400000);
  const events = await tx.contentEvent.deleteMany({
    where: { createdAt: { lt: ago(30) } },
  });
  const detached = await tx.leadAttribution.updateMany({
    where: { createdAt: { lt: ago(30) }, sessionKey: { not: null } },
    data: { sessionKey: null },
  });
  const attributions = await tx.leadAttribution.deleteMany({
    where: { createdAt: { lt: ago(180) } },
  });
  const days = await tx.contentDailyMetric.deleteMany({
    where: { day: { lt: ago(365) } },
  });
  const search = await tx.searchPerformanceMetric.deleteMany({
    where: { day: { lt: ago(730) } },
  });
  const jobs = await tx.analyticsSyncJob.deleteMany({
    where: { createdAt: { lt: ago(365) } },
  });
  const observations = await tx.geoVisibilityObservation.deleteMany({
    where: { observedOn: { lt: ago(365) } },
  });
  const result = {
    events: events.count,
    sessionLinksRemoved: detached.count,
    attributions: attributions.count,
    dailyMetrics: days.count,
    searchMetrics: search.count,
    jobs: jobs.count,
    observations: observations.count,
  };
  await tx.auditLog.create({
    data: {
      action: "ANALYTICS_RETENTION",
      resourceType: "analytics",
      metadata: result,
    },
  });
  return result;
}
