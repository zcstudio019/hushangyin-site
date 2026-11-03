const fs = require("fs"),
  { PrismaClient } = require("@prisma/client");
const p = new PrismaClient({ log: [] });
(async () => {
  const rows = await p.leadAttribution.findMany({
    include: {
      lead: {
        select: {
          id: true,
          createdAt: true,
          name: true,
          remark: true,
          consents: { select: { id: true } },
        },
      },
      article: { select: { id: true, slug: true, isLive: true } },
      faq: { select: { id: true, isLive: true } },
    },
    orderBy: { createdAt: "asc" },
  });
  const data = {
    environment: {
      site: process.env.SITE_URL,
      enabled: process.env.ANALYTICS_ENABLED === "true",
      local: process.env.LOCAL_TEST_MODE === "true",
      productionApproved: process.env.ANALYTICS_PRODUCTION_APPROVED === "true",
    },
    counts: {
      questions: await p.geoQuestion.count(),
      faqs: await p.faq.count(),
      articles: await p.article.count(),
      leads: await p.lead.count(),
      events: await p.contentEvent.count(),
      days: await p.contentDailyMetric.count(),
      attributions: rows.length,
    },
    attributions: rows.map((a) => ({
      id: a.id,
      leadId: a.leadId,
      articleId: a.articleId,
      faqId: a.faqId,
      sourceType: a.sourceType,
      confidence: a.confidence,
      measured: a.measured,
      createdAt: a.createdAt,
      leadExists: !!a.lead,
      consentCount: a.lead?.consents.length,
      syntheticMarkerPresent: /虚构|合成|测试|验收/.test(
        (a.lead?.name || "") + " " + (a.lead?.remark || ""),
      ),
      articleLive: a.article?.isLive,
      faqLive: a.faq?.isLive,
      path: a.path,
      matchingPV: a.sessionKey ? undefined : null,
    })),
    events: await p.contentEvent.groupBy({
      by: ["type"],
      _count: { _all: true },
    }),
    days: await p.contentDailyMetric.findMany({
      select: {
        day: true,
        pv: true,
        clicks: true,
        visits: true,
        convertedVisits: true,
        articleId: true,
        faqId: true,
        updatedAt: true,
      },
    }),
    articles: await p.article.findMany({
      where: { isLive: true },
      select: { id: true, slug: true, status: true, publishedRevision: true },
    }),
    faq: await p.faq.findFirst({
      where: { isLive: true },
      select: { id: true, publishedRevision: true },
    }),
  };
  fs.mkdirSync("test-results/analytics-acceptance", { recursive: true });
  fs.writeFileSync(
    "test-results/analytics-acceptance/audit.json",
    JSON.stringify(data, null, 2),
  );
  console.log(JSON.stringify(data, null, 2));
  await p.$disconnect();
})().catch(() => {
  console.error("审计失败；连接详情不输出");
  process.exitCode = 1;
});
