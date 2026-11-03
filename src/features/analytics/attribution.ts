import "server-only";
import type { Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { privateKey } from "@/lib/security";
import { HttpError } from "@/lib/http";
import { analyticsPolicy } from "./config";
import { readAnalytics, type SourceContext } from "./tokens";
import { liveContent, type ContentTarget } from "./events";
import { classifyChannel } from "./validation";
import type { ConsultationInput } from "@/lib/validations/consultation";
export async function resolveAttribution(
  tx: Prisma.TransactionClient,
  input: ConsultationInput,
) {
  let target: ContentTarget | null = null,
    confidence = "DIRECT_OR_UNKNOWN",
    channel = "DIRECT",
    utm = input.sourceParameters || {},
    sessionKey: string | undefined;
  if (input.attributionToken) {
    const c = readAnalytics<SourceContext>(input.attributionToken, "CONTENT");
    confidence = "INVALID_CONTEXT";
    channel = "UNKNOWN";
    utm = {};
    if (c) {
      target = await liveContent(tx, c.kind, c.id);
      if (target && target.path === c.path) {
        confidence = "SIGNED_CONTEXT";
        channel = c.channel;
        utm = c.utm;
        if (c.measurementExpiresAt && c.measurementExpiresAt > Date.now())
          sessionKey = c.measurementKey;
      } else target = null;
    }
  } else if (input.sourceArticleId || input.sourceFaqId) {
    target = await liveContent(
      tx,
      input.sourceFaqId ? "FAQ" : "ARTICLE",
      input.sourceFaqId || input.sourceArticleId!,
    );
    if (!target)
      throw new HttpError(
        400,
        "SOURCE_INVALID",
        "来源内容无效或已下线，请从咨询页面重新提交。",
      );
    confidence = "VALIDATED_LEGACY";
    channel = classifyChannel(utm);
  } else if (Object.keys(utm).length) channel = classifyChannel(utm);
  return { target, confidence, channel, utm, sessionKey };
}
export async function saveAttribution(
  tx: Prisma.TransactionClient,
  leadId: string,
  a: Awaited<ReturnType<typeof resolveAttribution>>,
) {
  const { target, confidence, channel, utm, sessionKey } = a;
  const pv =
    target && sessionKey
      ? await tx.contentEvent.findFirst({
          where: {
            sessionKey,
            contentKey: target.key,
            type: "PV",
            createdAt: { gte: new Date(Date.now() - 30 * 60000) },
          },
          orderBy: { createdAt: "asc" },
        })
      : null;
  await tx.leadAttribution.create({
    data: {
      leadId,
      articleId: target?.articleId,
      faqId: target?.faqId,
      sourceType:
        target?.kind ||
        (confidence === "INVALID_CONTEXT" ? "UNKNOWN" : "DIRECT"),
      contentTitle: target?.title,
      path: target?.path || "/contact/",
      channel,
      confidence,
      utmSource: utm.utm_source,
      utmMedium: utm.utm_medium,
      utmCampaign: utm.utm_campaign,
      sessionKey: pv ? sessionKey : null,
      measured: !!pv,
    },
  });
  if (pv && target) {
    const inserted = await tx.contentEvent.createMany({
      data: {
        id: randomUUID(),
        dedupeKey: privateKey(
          "analytics-conversion:" + sessionKey + ":" + target.key,
        ),
        type: "CONVERSION",
        articleId: target.articleId,
        faqId: target.faqId,
        contentKey: target.key,
        path: target.path,
        channel: pv.channel,
        sessionKey: sessionKey!,
        policyVersion: analyticsPolicy,
        day: pv.day,
      },
      skipDuplicates: true,
    });
    if (inserted.count)
      await tx.contentDailyMetric.upsert({
        where: {
          day_contentKey_channel: {
            day: pv.day,
            contentKey: target.key,
            channel: pv.channel,
          },
        },
        create: {
          day: pv.day,
          contentKey: target.key,
          path: target.path,
          articleId: target.articleId,
          faqId: target.faqId,
          channel: pv.channel,
          convertedVisits: 1,
        },
        update: { convertedVisits: { increment: 1 } },
      });
  }
}
