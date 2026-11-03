import {databaseProvider} from "@/lib/db/provider";
import { Prisma, type PrismaClient } from "@prisma/client";
import { HttpError } from "@/lib/http";
import type { KnowledgeSnapshot } from "./config";
import { containsSensitive } from "./validation";
import { sourceSchema } from "@/features/geo/validation";
import { classifyFaq, faqNeedsEvidence } from "@/features/geo/risk";
import { recheckFaqRisk } from "@/features/geo/risk-evidence";
type Client = Prisma.TransactionClient | PrismaClient;
export async function usableFaq(
  client: Client,
  faq: { question: string; answer: string; sources: unknown },
  checklist: unknown,
) {
  if (!faq.question.trim() || !faq.answer.trim()) return false;
  const risk = classifyFaq(faq.question, faq.answer);
  if (risk.blockers.length) return false;
  if (currentFaqSources(faq.sources)) return true;
  // Source-free general knowledge must carry the existing risk-v1 professional review.
  // Do not send internal bank evidence, or ignore expired/broken external citations.
  if (
    (faq.sources != null &&
      (!Array.isArray(faq.sources) || faq.sources.length)) ||
    faqNeedsEvidence(faq.question, faq.answer)
  )
    return false;
  const input = (
    checklist as {
      riskAssessment?: { input?: { level?: string; evidence?: unknown[] } };
    } | null
  )?.riskAssessment?.input;
  if (
    !input ||
    input.level === "HIGH" ||
    !Array.isArray(input.evidence) ||
    input.evidence.length
  )
    return false;
  try {
    return await recheckFaqRisk(client, faq, checklist);
  } catch {
    return false;
  }
}
export function currentFaqSources(value: unknown) {
  const parsed = sourceSchema.array().min(1).safeParse(value);
  const today = new Date().toISOString().slice(0, 10);
  return (
    parsed.success &&
    parsed.data.every(
      (s) => s.checkedAt <= today && (!s.validUntil || s.validUntil >= today),
    )
  );
}
export function searchTerms(question: string, keywords: string[]) {
  return [
    ...new Set([
      ...keywords,
      ...(question.match(/[\u4e00-\u9fff]{2,6}/g) || []),
    ]),
  ].slice(0, 12);
}
export interface KnowledgeRetriever {
  retrieve(client: Client, id: string): Promise<KnowledgeSnapshot>;
}
export const postgresKnowledge: KnowledgeRetriever = {
  async retrieve(client, id) {
    const question = await client.geoQuestion.findUnique({
      where: { id, status: { not: "ARCHIVED" } },
      select: {
        id: true,
        question: true,
        category: true,
        keywords: true,
        intent: true,
      },
    });
    if (!question)
      throw new HttpError(404, "QUESTION_MISSING", "融资问题不存在。");
    const terms = searchTerms(question.question, question.keywords);
    const textIds = databaseProvider()!=="postgresql"?[]:await client.$queryRaw<
      { id: string }[]
    >`SELECT id FROM geo_questions WHERE to_tsvector('simple',question) @@ plainto_tsquery('simple',${question.question}) LIMIT 10`;
    const similarQuestions = await client.geoQuestion.findMany({
      where: {
        id: { not: id },
        status: { not: "ARCHIVED" },
        OR: [
          { category: question.category },
          { id: { in: textIds.map((x) => x.id) } },
          ...terms.map((t) => ({ question: { contains: t } })),
        ],
      },
      select: { id: true, question: true, category: true },
      take: 5,
      orderBy: { priority: "asc" },
    });
    const candidates = await client.faq.findMany({
      where: {
        OR: [{ status: "APPROVED" }, { isLive: true }],
        AND: [
          {
            OR: [
              { category: question.category },
              ...terms.map((t) => ({ question: { contains: t } })),
            ],
          },
        ],
      },
      include: {
        reviews: {
          where: { decision: "APPROVED" },
          select: { revision: true, checklist: true },
        },
      },
      take: 30,
      orderBy: { updatedAt: "desc" },
    });
    const faqs: KnowledgeSnapshot["faqs"] = [];
    for (const f of candidates) {
      const mode = f.status === "APPROVED" ? "approved" : "published";
      const revision = mode === "approved" ? f.revision : f.publishedRevision;
      if (revision === null || !f.reviews.some((r) => r.revision === revision))
        continue;
      const s = f.publishedSnapshot as {
        question?: string;
        answer?: string;
        sources?: unknown;
      } | null;
      const answer = mode === "approved" ? f.answer : s?.answer;
      const title = mode === "approved" ? f.question : s?.question;
      const review = f.reviews.find((r) => r.revision === revision);
      const sourcesCurrent =
        answer &&
        title &&
        (await usableFaq(
          client,
          {
            question: title,
            answer,
            sources: mode === "approved" ? f.sources : s?.sources,
          },
          review?.checklist,
        ));
      if (answer && title && sourcesCurrent)
        faqs.push({
          id: f.id,
          question: title,
          answer,
          revision,
          mode,
          sources: mode === "approved" ? f.sources : s?.sources,
          evidenceKind: currentFaqSources(
            mode === "approved" ? f.sources : s?.sources,
          )
            ? "PUBLIC_SOURCES"
            : "PROFESSIONAL_REVIEW",
        });
      if (faqs.length === 8) break;
    }
    const articles = (
      await client.article.findMany({
        where: {
          isLive: true,
          OR: [
            { category: question.category },
            ...terms.map((t) => ({ title: { contains: t } })),
          ],
        },
        include: {
          reviews: {
            where: { decision: "APPROVED" },
            select: { revision: true },
          },
        },
        take: 4,
        orderBy: { publishedAt: "desc" },
      })
    ).flatMap((a) => {
      const s = a.publishedSnapshot as {
        title?: string;
        content?: string;
      } | null;
      return s?.title && s.content
        ? [
            {
              id: a.id,
              title: s.title,
              content: s.content.slice(0, 8000),
              verified:
                a.publishedRevision !== null &&
                a.reviews.some((r) => r.revision === a.publishedRevision),
              revision: a.publishedRevision,
            },
          ]
        : [];
    });
    const references = (
      await client.articleSource.findMany({
        where: {
          articleId: null,
          catalogId: null,
          sourceType: { not: "INTERNAL_BANK" },
          isActive: true,
          verifiedAt: { not: null, lte: new Date() },
          verifiedById: { not: null },
          OR: [{ validUntil: null }, { validUntil: { gte: new Date() } }],
        },
        take: 20,
        orderBy: { verifiedAt: "desc" },
      })
    ).map((s) => ({
      id: s.id,
      title: s.title,
      url: s.sourceUrl,
      excerpt: s.excerpt,
      verifiedAt: s.verifiedAt!.toISOString(),
      validUntil: s.validUntil?.toISOString() || null,
    }));
    const warnings: string[] = [];
    if (!faqs.length)
      warnings.push(
        "未找到经过人工审核的相关问答；待审核问答不会作为事实依据。",
      );
    if (!references.length)
      warnings.push(
        "尚未配置可追溯且在有效期内的人工核验参考资料，生成结果只能作为一般性草稿。",
      );
    if (articles.some((a) => !a.verified))
      warnings.push("历史文章仅作选题背景，不作为已核验事实。");
    const result = {
      question,
      similarQuestions,
      faqs,
      articles,
      references,
      warnings,
      retrievedAt: new Date().toISOString(),
    };
    if (containsSensitive(JSON.stringify(result)))
      throw new HttpError(
        400,
        "SENSITIVE_KNOWLEDGE",
        "知识资料含疑似个人信息，请先核查，不会外发。",
      );
    return result;
  },
};
export async function assertEvidence(client: Client, k: KnowledgeSnapshot) {
  for (const f of k.faqs) {
    const current = await client.faq.findUnique({
      where: { id: f.id },
      include: {
        reviews: {
          where: { decision: "APPROVED" },
          select: { revision: true, checklist: true },
        },
      },
    });
    if (
      !current ||
      !(await usableFaq(
        client,
        {
          question:
            f.mode === "approved"
              ? current.question
              : (current.publishedSnapshot as { question?: string } | null)
                  ?.question || "",
          answer:
            f.mode === "approved"
              ? current.answer
              : (current.publishedSnapshot as { answer?: string } | null)
                  ?.answer || "",
          sources:
            f.mode === "approved"
              ? current.sources
              : (current.publishedSnapshot as { sources?: unknown } | null)
                  ?.sources,
        },
        current.reviews.find((r) => r.revision === f.revision)?.checklist,
      )) ||
      !current.reviews.some((r) => r.revision === f.revision) ||
      (f.mode === "approved"
        ? current.status !== "APPROVED" || current.revision !== f.revision
        : !current.isLive || current.publishedRevision !== f.revision)
    )
      throw new HttpError(
        409,
        "KNOWLEDGE_CHANGED",
        "关联问答的审核状态已变化，请重新检索并创建任务。",
      );
  }
  for (const s of k.references) {
    const r = await client.articleSource.findUnique({ where: { id: s.id } });
    if (
      !r ||
      !r.isActive ||
      r.sourceType === "INTERNAL_BANK" ||
      r.articleId ||
      !r.verifiedById ||
      r.verifiedAt?.toISOString() !== s.verifiedAt ||
      r.sourceUrl !== s.url ||
      r.excerpt !== s.excerpt ||
      (r.validUntil && r.validUntil < new Date())
    )
      throw new HttpError(
        409,
        "SOURCE_CHANGED",
        "引用资料已变更或过期，请重新检索。",
      );
  }
}
