import "server-only";
import { z } from "zod";
import { db } from "@/lib/db";
import { authorize } from "@/lib/auth/authorization";
import type { Actor } from "@/lib/auth/session";
import { geoWrite } from "@/features/geo/write";
import { parseGeo } from "@/features/geo/errors";
import { containsSensitive } from "@/features/generation/validation";
import { HttpError } from "@/lib/http";
import { dayDate, localDay } from "./config";
const schema = z
  .object({
    platform: z.string().trim().min(1).max(60),
    query: z.string().trim().min(2).max(300),
    observedOn: z.iso.date(),
    brandMention: z.boolean(),
    siteCitation: z.boolean(),
    recommendation: z.boolean(),
    articleId: z.string().max(64).nullable(),
    evidenceUrl: z
      .url()
      .max(1000)
      .refine((v) => {
        const u = new URL(v);
        return (
          u.protocol === "https:" &&
          !u.username &&
          !u.password &&
          !u.search &&
          !u.hash
        );
      }, "使用无登录凭据、无查询参数的HTTPS公开结果证据链接。"),
    evidenceNote: z.string().trim().min(10).max(1500),
    verified: z.literal(true),
  })
  .strict();
export async function visibilityData(actor: Actor) {
  await authorize(actor, "analytics.read");
  return db().geoVisibilityObservation.findMany({
    include: {
      actor: { select: { name: true } },
      article: { select: { title: true, slug: true, isLive: true } },
    },
    orderBy: { observedOn: "desc" },
    take: 200,
  });
}
export async function saveVisibility(actor: Actor, input: unknown) {
  const v = parseGeo(schema, input);
  if (v.observedOn > localDay())
    throw new HttpError(400, "DATE_INVALID", "测试日期不能晚于今天。");
  if (
    containsSensitive(
      v.query + " " + v.platform + " " + v.evidenceNote + " " + v.evidenceUrl,
    )
  )
    throw new HttpError(
      400,
      "SENSITIVE_OBSERVATION",
      "人工观察不得包含客户身份资料或访问凭据。",
    );
  return geoWrite(actor, "visibility.write", async (tx) => {
    if (
      v.articleId &&
      !(await tx.article.findFirst({
        where: { id: v.articleId, isLive: true },
      }))
    )
      throw new HttpError(
        400,
        "ARTICLE_NOT_PUBLIC",
        "只能关联实际已发布的文章。",
      );
    if (v.articleId && !v.siteCitation)
      throw new HttpError(
        400,
        "CITATION_REQUIRED",
        "关联被引用文章时须明确核验官网链接引用。",
      );
    const { verified, ...data } = v;
    void verified;
    const o = await tx.geoVisibilityObservation.create({
      data: { ...data, observedOn: dayDate(v.observedOn), actorId: actor.id },
    });
    await tx.auditLog.create({
      data: {
        actorId: actor.id,
        action: "GEO_OBSERVATION_CREATE",
        resourceType: "geo_observation",
        resourceId: o.id,
        metadata: { platform: v.platform, observedOn: v.observedOn },
      },
    });
    return { id: o.id };
  });
}
