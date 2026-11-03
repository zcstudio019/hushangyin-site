import "server-only";
import type { Prisma } from "@prisma/client";
import type { Actor } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { can } from "@/lib/auth/permissions";
import { authorize } from "@/lib/auth/authorization";
import { geoWrite } from "@/features/geo/write";
import { riskSchema, classifyFaq } from "@/features/geo/risk";
import { checkFaqRisk } from "@/features/geo/risk-evidence";
import { checkGeneratedArticle } from "./article-check";
import {
  factFingerprint,
  factIndependent,
  asRiskContent,
} from "./article-evidence";
import { containsSensitive } from "./validation";
import { HttpError } from "@/lib/http";
import { parseGeo } from "@/features/geo/errors";
import { z } from "zod";
const json = (v: unknown) =>
  JSON.parse(JSON.stringify(v)) as Prisma.InputJsonValue;
const inputSchema = z
  .object({
    action: z.enum(["check", "request", "decide"]),
    revision: z.number().int().min(0),
    findingKey: z.string().length(64).optional(),
    requestId: z.string().max(64).optional(),
    note: z.string().trim().min(10).max(1000).optional(),
    accepted: z.boolean().optional(),
    risk: riskSchema.optional(),
  })
  .strict();
export async function pendingFactReviews(actor: Actor) {
  await authorize(actor, "content.review");
  return db().$transaction(async (tx) => {
    const requests = await tx.auditLog.findMany({
      where: { action: "ARTICLE_FACT_REQUEST", resourceType: "geo_articles" },
      orderBy: { createdAt: "desc" },
      take: 100,
      select: { id: true, resourceId: true, metadata: true, createdAt: true },
    });
    const ids = [
      ...new Set(
        requests.map((r) => r.resourceId).filter((id): id is string => !!id),
      ),
    ];
    const articles = await tx.article.findMany({
      where: { id: { in: ids }, status: "DRAFT" },
    });
    const decisions = await tx.auditLog.findMany({
      where: {
        action: "ARTICLE_FACT_DECISION",
        resourceType: "geo_articles",
        resourceId: { in: ids },
      },
      select: { metadata: true },
    });
    const out = [];
    for (const r of requests) {
      const a = articles.find((a) => a.id === r.resourceId),
        m = r.metadata as { fingerprint?: string; revision?: number } | null;
      if (
        !a ||
        m?.revision !== a.revision ||
        m.fingerprint !== factFingerprint(a) ||
        decisions.some(
          (d) =>
            (d.metadata as { requestId?: string } | null)?.requestId === r.id,
        )
      )
        continue;
      if (await factIndependent(tx, a, actor.id))
        out.push({
          id: r.id,
          articleId: a.id,
          title: a.title,
          revision: a.revision,
          createdAt: r.createdAt,
        });
    }
    return out;
  });
}
async function article(tx: Prisma.TransactionClient, id: string) {
  const a = await tx.article.findUnique({ where: { id } });
  if (!a) throw new HttpError(404, "NOT_FOUND", "文章不存在。");
  if (!a.generationMetadata)
    throw new HttpError(
      400,
      "NOT_AI_ARTICLE",
      "请使用原文章审核流程；此入口仅处理AI草稿核验。",
    );
  return a;
}
export async function articleFacts(actor: Actor, id: string) {
  await authorize(actor, "content.read");
  return db().$transaction(async (tx) => {
    const a = await article(tx, id),
      fingerprint = factFingerprint(a);
    const findings = await checkGeneratedArticle(tx, a, false);
    const records = await tx.auditLog.findMany({
      where: {
        resourceType: "geo_articles",
        resourceId: id,
        action: { in: ["ARTICLE_FACT_REQUEST", "ARTICLE_FACT_DECISION"] },
        metadata: { path: ["revision"], equals: a.revision },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
      select: {
        id: true,
        action: true,
        actorId: true,
        metadata: true,
        createdAt: true,
        actor: { select: { name: true } },
      },
    });
    const catalog = await tx.articleSource.findMany({
      where: { articleId: null, sourceType: "INTERNAL_BANK", isActive: true },
      select: {
        id: true,
        title: true,
        sourceUrl: true,
        excerpt: true,
        updatedAt: true,
        verifiedAt: true,
        validUntil: true,
      },
      take: 100,
      orderBy: { title: "asc" },
    });
    return {
      articleId: id,
      revision: a.revision,
      status: a.status,
      fingerprint,
      findings,
      checkedAt:
        (a.complianceReport as { checkedAt?: string } | null)?.checkedAt ||
        null,
      canRequest: can(actor, "content.update"),
      canDecide: await factIndependent(tx, a, actor.id),
      records: records.filter(
        (r) =>
          (r.metadata as { fingerprint?: string } | null)?.fingerprint ===
          fingerprint,
      ),
      context: {
        question: a.title,
        answer: a.content,
        sources: a.sources,
        catalog,
      },
      risk: classifyFaq(a.title, a.content),
    };
  });
}
export async function actOnArticleFacts(
  actor: Actor,
  id: string,
  input: unknown,
) {
  const v = parseGeo(inputSchema, input),
    permission =
      v.action === "decide"
        ? "content.review"
        : v.action === "request"
          ? "content.update"
          : "content.read";
  return geoWrite(actor, permission, async (tx) => {
    const a = await article(tx, id),
      fingerprint = factFingerprint(a);
    if (v.revision !== a.revision)
      throw new HttpError(
        409,
        "STALE_VERSION",
        "文章版本已更新，请保存或载入最新版本后重新核验。",
      );
    if (v.note && containsSensitive(v.note))
      throw new HttpError(
        400,
        "SENSITIVE_NOTE",
        "判断依据不得包含客户个人资料或密钥。",
      );
    const findings = await checkGeneratedArticle(tx, a, false);
    if (v.action === "check") {
      await tx.article.update({
        where: { id },
        data: {
          complianceReport: json({
            revision: a.revision,
            fingerprint,
            checkedAt: new Date().toISOString(),
            findings,
          }),
        },
      });
      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          action: "ARTICLE_FACT_CHECK",
          resourceType: "geo_articles",
          resourceId: id,
          metadata: {
            revision: a.revision,
            fingerprint,
            blocking: findings.filter((f) => f.severity === "MUST_FIX").length,
          },
        },
      });
      return { revision: a.revision, findings };
    }
    if (a.status !== "DRAFT")
      throw new HttpError(
        409,
        "REVIEW_LOCKED",
        "请先通过正式流程撤回并保存草稿，再申请核验；不能修改锁定审核版本。",
      );
    if (!v.note)
      throw new HttpError(
        400,
        "NOTE_REQUIRED",
        "请填写至少10字的申请或判断依据。",
      );
    if (v.action === "request") {
      const f = findings.find((f) => f.key === v.findingKey);
      if (!f)
        throw new HttpError(
          409,
          "FINDING_CHANGED",
          "该检查项已变化或解决，请重新检查当前版本。",
        );
      const existing = await tx.auditLog.findFirst({
        where: {
          action: "ARTICLE_FACT_REQUEST",
          resourceType: "geo_articles",
          resourceId: id,
          AND: [
            { metadata: { path: ["fingerprint"], equals: fingerprint } },
            { metadata: { path: ["findingKey"], equals: f.key! } },
          ],
        },
        orderBy: { createdAt: "desc" },
      });
      if (
        existing &&
        !(await tx.auditLog.findFirst({
          where: {
            action: "ARTICLE_FACT_DECISION",
            resourceId: id,
            resourceType: "geo_articles",
            metadata: { path: ["requestId"], equals: existing.id },
          },
        }))
      )
        return { id: existing.id, duplicate: true };
      return tx.auditLog.create({
        data: {
          actorId: actor.id,
          action: "ARTICLE_FACT_REQUEST",
          resourceType: "geo_articles",
          resourceId: id,
          metadata: json({
            revision: a.revision,
            fingerprint,
            findingKey: f.key,
            code: f.code,
            note: v.note,
          }),
        },
        select: { id: true },
      });
    }
    if (!(await factIndependent(tx, a, actor.id)))
      throw new HttpError(
        403,
        "INDEPENDENT_REVIEW",
        "当前账号没有独立审核资格，作者、编辑或提交人不得复核自己的版本。",
      );
    const request = await tx.auditLog.findFirst({
      where: {
        id: v.requestId,
        action: "ARTICLE_FACT_REQUEST",
        resourceType: "geo_articles",
        resourceId: id,
      },
    });
    const meta = request?.metadata as {
      fingerprint?: string;
      revision?: number;
      findingKey?: string;
    } | null;
    if (
      !request ||
      meta?.fingerprint !== fingerprint ||
      meta.revision !== a.revision
    )
      throw new HttpError(
        409,
        "REQUEST_CHANGED",
        "申请不存在或版本已变化，请重新发起申请。",
      );
    if (
      await tx.auditLog.findFirst({
        where: {
          action: "ARTICLE_FACT_DECISION",
          resourceType: "geo_articles",
          resourceId: id,
          metadata: { path: ["requestId"], equals: request.id },
        },
      })
    )
      throw new HttpError(
        409,
        "ALREADY_DECIDED",
        "该申请已处理，请重新检查结果，不要重复复核。",
      );
    if (v.accepted === undefined)
      throw new HttpError(400, "DECISION_REQUIRED", "请选择复核结论。");
    let assessment: unknown = null;
    if (v.accepted) {
      if (
        findings.some(
          (f) =>
            ["GUARANTEE", "UNSAFE", "REPAYMENT_RISK", "CLAIM_LIMIT"].includes(
              f.code,
            ) && f.severity === "MUST_FIX",
        )
      )
        throw new HttpError(
          400,
          "MUST_EDIT",
          "当前存在真实承诺、隐私或其他必须修改的风险，不能以勾选或复核结论放行，请先修改正文。",
        );
      if (!v.risk)
        throw new HttpError(
          400,
          "RISK_REQUIRED",
          "请完成风险等级、专业判断及必要的逐项证据核验。",
        );
      if (containsSensitive(v.risk.basis))
        throw new HttpError(
          400,
          "SENSITIVE_NOTE",
          "专业判断不得包含客户个人信息。",
        );
      assessment = await checkFaqRisk(tx, asRiskContent(a), v.risk);
    }
    await tx.auditLog.create({
      data: {
        actorId: actor.id,
        action: "ARTICLE_FACT_DECISION",
        resourceType: "geo_articles",
        resourceId: id,
        metadata: json({
          revision: a.revision,
          fingerprint,
          requestId: request.id,
          accepted: v.accepted,
          note: v.note,
          riskAssessment: assessment,
        }),
      },
    });
    const updated = await checkGeneratedArticle(tx, a, false);
    await tx.article.update({
      where: { id },
      data: {
        complianceReport: json({
          revision: a.revision,
          fingerprint,
          checkedAt: new Date().toISOString(),
          findings: updated,
        }),
      },
    });
    return { revision: a.revision, findings: updated };
  });
}
