import { databaseProvider } from "@/lib/db/provider";
import "server-only";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { authorize } from "@/lib/auth/authorization";
import type { Actor } from "@/lib/auth/session";
import { analyticsEnabled, dayDate, localDay } from "./config";
import { categories } from "@/features/geo/config";
import { HttpError } from "@/lib/http";
export async function analyticsReport(
  actor: Actor,
  q: Record<string, string | undefined> = {},
) {
  await authorize(actor, "analytics.read");
  const days = Number(q.days || 30);
  if (![7, 30, 90].includes(days))
    throw new HttpError(400, "RANGE_INVALID", "请选择7、30或90天。");
  if (
    q.category &&
    !categories.includes(q.category as (typeof categories)[number])
  )
    throw new HttpError(400, "CATEGORY_INVALID", "请选择有效内容分类。");
  const today = localDay(),
    startDay = localDay(new Date(Date.now() - (days - 1) * 86400000)),
    start = dayDate(startDay),
    end = dayDate(today),
    from = new Date(startDay + "T00:00:00+08:00"),
    until = new Date(new Date(today + "T00:00:00+08:00").getTime() + 86400000);
  const [content, metrics, attributions, published, faqs] = await Promise.all([
    // Only public metadata is needed; never load complete article bodies for reports.
    databaseProvider() !== "postgresql"
      ? db()
          .article.findMany({
            select: {
              id: true,
              title: true,
              slug: true,
              category: true,
              publishedAt: true,
              updatedAt: true,
              isLive: true,
              publishedSnapshot: true,
            },
            orderBy: { createdAt: "desc" },
          })
          .then((rows) =>
            rows.map((a) => {
              const snapshot = a.publishedSnapshot as {
                title?: string;
                category?: string;
              } | null;
              return {
                ...a,
                title: snapshot?.title || a.title,
                category: snapshot?.category || a.category,
              };
            }),
          )
      : db().$queryRaw<
          Array<{
            id: string;
            title: string;
            slug: string;
            category: string;
            publishedAt: Date | null;
            updatedAt: Date;
            isLive: boolean;
          }>
        >`
      SELECT id, COALESCE("publishedSnapshot"->>'title',title) AS title, slug,
        COALESCE("publishedSnapshot"->>'category',category) AS category,
        "publishedAt", "updatedAt", "isLive" FROM articles ORDER BY "createdAt" DESC
    `,
    db().contentDailyMetric.findMany({
      where: { day: { gte: start, lte: end } },
    }),
    db().leadAttribution.groupBy({
      by: ["articleId", "sourceType", "confidence"],
      where: { createdAt: { gte: from, lt: until } },
      _count: { _all: true },
      _max: { createdAt: true },
    }),
    db().article.count({
      where: { isLive: true, publishedSnapshot: { not: Prisma.JsonNull } },
    }),
    db().faq.count({ where: { isLive: true } }),
  ]);
  const allowed = q.category
    ? content.filter((a) => a.category === q.category)
    : content;
  const ids = new Set(allowed.map((a) => a.id));
  const selected = metrics.filter(
    (m) => !q.category || (!!m.articleId && ids.has(m.articleId)),
  );
  const sum = (
    key: "pv" | "visits" | "clicks" | "convertedVisits",
    rows = selected,
  ) => rows.reduce((n, r) => n + r[key], 0);
  const ranking = allowed
    .map((a) => {
      const rows = metrics.filter((m) => m.articleId === a.id),
        pv = sum("pv", rows),
        visits = sum("visits", rows),
        clicks = sum("clicks", rows),
        converted = sum("convertedVisits", rows),
        consults = attributions
          .filter((r) => r.articleId === a.id && r.sourceType === "ARTICLE")
          .reduce((n, r) => n + r._count._all, 0),
        dataDates = [
          ...rows.map((r) => r.updatedAt),
          ...attributions
            .filter((r) => r.articleId === a.id)
            .map((r) => r._max.createdAt)
            .filter((d): d is Date => !!d),
        ];
      return {
        id: a.id,
        title: a.title,
        path: "/insights/" + a.slug + "/",
        isLive: a.isLive,
        publishedAt: a.publishedAt,
        updatedAt: rows.reduce(
          (d, r) => (r.updatedAt > d ? r.updatedAt : d),
          a.updatedAt,
        ),
        pv: rows.length ? pv : null,
        visits: rows.length ? visits : null,
        clicks: rows.length ? clicks : null,
        consults: rows.length || consults ? consults : null,
        conversion: visits >= 20 ? converted / visits : null,
        lowSample: visits < 20,
        dataUpdatedAt: dataDates.reduce<Date | null>(
          (last, d) => (!last || d > last ? d : last),
          null,
        ),
        channels: [...new Set(rows.map((r) => r.channel))],
      };
    })
    .filter((a) => a.isLive || a.pv || a.consults);
  ranking.sort(
    q.sort === "conversion"
      ? (a, b) =>
          (b.lowSample ? -1 : (b.conversion ?? -1)) -
            (a.lowSample ? -1 : (a.conversion ?? -1)) ||
          (b.consults || 0) - (a.consults || 0)
      : (a, b) =>
          (b.consults || 0) - (a.consults || 0) || (b.pv || 0) - (a.pv || 0),
  );
  const visits = sum("visits"),
    pv = sum("pv");
  const attributed = attributions
    .filter(
      (r) =>
        ["ARTICLE", "FAQ"].includes(r.sourceType) &&
        (!q.category || (r.articleId && ids.has(r.articleId))),
    )
    .reduce((n, r) => n + r._count._all, 0);
  const articleConsults = attributions
    .filter(
      (r) =>
        r.sourceType === "ARTICLE" &&
        (!q.category || (r.articleId && ids.has(r.articleId))),
    )
    .reduce((n, r) => n + r._count._all, 0);
  const trend = Array.from({ length: days }, (_, i) => {
    const day = localDay(new Date(Date.now() - (days - 1 - i) * 86400000)),
      rows = selected.filter((m) => m.day.toISOString().slice(0, 10) === day);
    return {
      day,
      pv: rows.length ? sum("pv", rows) : null,
      clicks: rows.length ? sum("clicks", rows) : null,
      convertedVisits: rows.length ? sum("convertedVisits", rows) : null,
    };
  });
  const dailyConsultations =
    databaseProvider() !== "postgresql"
      ? await portableConsultationDays(from, until)
      : await db().$queryRaw<
          Array<{
            day: string;
            articleId: string | null;
            sourceType: string;
            count: number;
          }>
        >`
    SELECT to_char("createdAt" AT TIME ZONE 'Asia/Shanghai','YYYY-MM-DD') AS day,
      "articleId", "sourceType", COUNT(*)::int AS count
    FROM lead_attributions WHERE "createdAt">=${from} AND "createdAt"<${until}
      AND "sourceType" IN ('ARTICLE','FAQ') GROUP BY 1,2,3
  `;
  const sourceDays = dailyConsultations.filter(
    (d) => !q.category || (!!d.articleId && ids.has(d.articleId)),
  );
  const articleRows = selected.filter((m) => m.articleId !== null);
  const timestamps = [
    ...selected.map((m) => m.updatedAt),
    ...attributions
      .filter((a) => !q.category || (!!a.articleId && ids.has(a.articleId)))
      .map((a) => a._max.createdAt)
      .filter((d): d is Date => !!d),
  ];
  return {
    days,
    category: q.category || "",
    enabled: analyticsEnabled(),
    startDay,
    endDay: today,
    publishedArticles: published,
    publishedFaqs: faqs,
    pv: selected.length ? pv : null,
    articlePv: articleRows.length ? sum("pv", articleRows) : null,
    visits: selected.length ? visits : null,
    clicks: selected.length ? sum("clicks") : null,
    articleConsults: articleConsults || null,
    attributedLeads: attributed || null,
    conversion: visits >= 20 ? sum("convertedVisits") / visits : null,
    lowSample: visits > 0 && visits < 20,
    lastUpdatedAt: timestamps.length
      ? new Date(Math.max(...timestamps.map((d) => d.getTime())))
      : null,
    localTestMode: process.env.LOCAL_TEST_MODE === "true",
    ranking: ranking.slice(0, 100),
    trend: trend.map((d) => ({
      ...d,
      consults:
        sourceDays.some((r) => r.day === d.day) ||
        selected.some((m) => m.day.toISOString().slice(0, 10) === d.day)
          ? sourceDays
              .filter((r) => r.day === d.day)
              .reduce((n, r) => n + r.count, 0)
          : null,
    })),
    collectionStartedAt:
      (
        await db().contentEvent.findFirst({
          orderBy: { createdAt: "asc" },
          select: { createdAt: true },
        })
      )?.createdAt || null,
  };
}

async function portableConsultationDays(from: Date, until: Date) {
  const rows = await db().leadAttribution.findMany({
    where: {
      createdAt: { gte: from, lt: until },
      sourceType: { in: ["ARTICLE", "FAQ"] },
    },
    select: { articleId: true, sourceType: true, createdAt: true },
  });
  const groups = new Map<
    string,
    { day: string; articleId: string | null; sourceType: string; count: number }
  >();
  for (const r of rows) {
    const day = localDay(r.createdAt),
      key = JSON.stringify([day, r.articleId, r.sourceType]),
      group = groups.get(key) || {
        day,
        articleId: r.articleId,
        sourceType: r.sourceType,
        count: 0,
      };
    group.count++;
    groups.set(key, group);
  }
  return [...groups.values()];
}
