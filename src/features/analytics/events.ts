import "server-only";
import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { privateKey } from "@/lib/security";
import { HttpError } from "@/lib/http";
import { analyticsPolicy, dayDate, localDay } from "./config";
import { anonymousSession } from "./tokens";
import { classifyChannel } from "./validation";
import { articlePath } from "@/features/geo/config";
import { faqPath } from "@/features/geo/public-faq";
type Kind = "ARTICLE" | "FAQ";
export async function liveContent(
  tx: Prisma.TransactionClient,
  kind: Kind,
  id: string,
) {
  if (kind === "ARTICLE") {
    const a = await tx.article.findFirst({
      where: { id, isLive: true, publishedSnapshot: { not: Prisma.JsonNull } },
      select: { id: true, slug: true, publishedSnapshot: true },
    });
    if (a)
      return {
        kind,
        id,
        key: "article:" + id,
        articleId: id,
        faqId: null,
        path: articlePath(a.slug),
        title: (a.publishedSnapshot as { title: string }).title,
      };
  } else {
    const f = await tx.faq.findFirst({
      where: { id, isLive: true },
      include: {
        reviews: {
          where: { decision: "APPROVED" },
          select: { revision: true },
        },
      },
    });
    if (
      f?.publishedSnapshot &&
      f.publishedRevision !== null &&
      f.reviews.some((r) => r.revision === f.publishedRevision)
    )
      return {
        kind,
        id,
        key: "faq:" + id,
        articleId: null,
        faqId: id,
        path: faqPath(id),
        title: (f.publishedSnapshot as { question: string }).question,
      };
  }
  return null;
}
export type ContentTarget = NonNullable<
  Awaited<ReturnType<typeof liveContent>>
>;
export async function recordEvent(
  tx: Prisma.TransactionClient,
  input: {
    kind: Kind;
    id: string;
    type: "PV" | "CLICK";
    eventId: string;
    analyticsToken: string;
    utm?: { utm_source?: string; utm_medium?: string; utm_campaign?: string };
    referrerHost?: string;
  },
) {
  const session = anonymousSession(input.analyticsToken);
  if (!session)
    throw new HttpError(
      400,
      "ANALYTICS_CONSENT_REQUIRED",
      "分析授权不存在或已过期，请重新选择；咨询功能不受影响。",
    );
  const target = await liveContent(tx, input.kind, input.id);
  if (!target)
    throw new HttpError(
      404,
      "CONTENT_NOT_PUBLIC",
      "该内容未公开，不计入访问统计。",
    );
  const day = dayDate(localDay()),
    channel = classifyChannel(input.utm, input.referrerHost),
    base = {
      articleId: target.articleId,
      faqId: target.faqId,
      contentKey: target.key,
      path: target.path,
      channel,
      sessionKey: session.key,
      policyVersion: analyticsPolicy,
      day,
    };
  const inserted = await tx.contentEvent.createMany({
    data: {
      ...base,
      id: input.eventId,
      dedupeKey: privateKey("analytics-event:" + input.eventId),
      type: input.type,
    },
    skipDuplicates: true,
  });
  if (!inserted.count) return { accepted: true, duplicate: true };
  let visits = 0;
  if (input.type === "PV")
    visits = (
      await tx.contentEvent.createMany({
        data: {
          ...base,
          id: randomUUID(),
          dedupeKey: privateKey(
            "analytics-visit:" + session.key + ":" + target.key,
          ),
          type: "VISIT",
        },
        skipDuplicates: true,
      })
    ).count;
  await tx.contentDailyMetric.upsert({
    where: { day_contentKey_channel: { day, contentKey: target.key, channel } },
    create: {
      day,
      contentKey: target.key,
      path: target.path,
      articleId: target.articleId,
      faqId: target.faqId,
      channel,
      pv: input.type === "PV" ? 1 : 0,
      clicks: input.type === "CLICK" ? 1 : 0,
      visits,
    },
    update: {
      pv: { increment: input.type === "PV" ? 1 : 0 },
      clicks: { increment: input.type === "CLICK" ? 1 : 0 },
      visits: { increment: visits },
    },
  });
  return { accepted: true, duplicate: false };
}
