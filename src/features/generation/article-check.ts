import { Prisma } from "@prisma/client";
import { HttpError } from "@/lib/http";
import { compliance } from "./compliance";
import type { Snapshot } from "@/features/geo/validation";
import { usableFaq } from "./knowledge";
import { factApproval } from "./article-evidence";
import { classifyFaq, riskClaims } from "@/features/geo/risk";
import { createHash } from "node:crypto";
export async function checkGeneratedArticle(
  tx: Prisma.TransactionClient,
  article: {
    id: string;
    content: string;
    tags: string[];
    sources: unknown;
    generationMetadata: unknown;
    revision: number;
    title?: string;
    authorId?: string | null;
    editorId?: string | null;
    submittedById?: string | null;
  },
  enforce: boolean,
) {
  if (!article.generationMetadata) return [];
  const sources = article.sources as Snapshot["sources"];
  const findings = compliance(
    article.content,
    article.tags,
    sources.length > 0,
  );
  const validParagraphs: string[] = [];
  for (const s of sources) {
    const catalog = await tx.articleSource.findFirst({
      where: {
        articleId: null,
        catalogId: null,
        sourceType: { not: "INTERNAL_BANK" },
        sourceUrl: s.url,
        isActive: true,
        verifiedAt: { not: null, lte: new Date() },
        verifiedById: { not: null },
        OR: [{ validUntil: null }, { validUntil: { gte: new Date() } }],
      },
    });
    const binding = await tx.articleSource.findFirst({
      where: {
        articleId: article.id,
        revision: article.revision,
        sourceUrl: s.url,
        paragraph: s.paragraph || "",
      },
    });
    if (
      !catalog ||
      !binding ||
      binding.verifiedAt?.toISOString() !== catalog.verifiedAt?.toISOString() ||
      binding.excerpt !== catalog.excerpt ||
      s.title !== catalog.title ||
      (s.validUntil || "") !==
        (catalog.validUntil?.toISOString().slice(0, 10) || "") ||
      !s.paragraph ||
      !article.content.includes(s.paragraph) ||
      s.checkedAt !== catalog.verifiedAt?.toISOString().slice(0, 10)
    )
      findings.push({
        severity: "MUST_FIX",
        code: "SOURCE_BINDING",
        objectId: s.url,
        location: `引用：${s.title}`,
        excerpt: s.paragraph,
        message: `引用“${s.title}”必须对应当前有效的人工核验资料及正文原段落。`,
      });
    else validParagraphs.push(s.paragraph!);
  }
  const suggested = classifyFaq(article.title || "", article.content);
  const claims = riskClaims(
    article.title || "",
    article.content,
    suggested.level,
  );
  const proof = await factApproval(tx, article);
  for (const claim of claims) {
    const index = article.content.indexOf(claim);
    if (!proof && !validParagraphs.some((p) => p.includes(claim)))
      findings.push({
        severity: "MUST_FIX",
        code: "FACT_EVIDENCE",
        claim,
        objectId: claim,
        excerpt: claim,
        location:
          index >= 0
            ? `正文第${article.content.slice(0, index).split("\n").length}行`
            : "文章标题",
        message:
          "具体事实尚缺对应有效依据，请为这项主张补充公开来源，或申请独立人员核验受控内部资料。",
      });
  }
  if (suggested.blockers.some((s) => s.includes("40")))
    findings.push({
      severity: "MUST_FIX",
      code: "CLAIM_LIMIT",
      message: "具体主张过多，请拆分文章后逐项核验。",
    });
  if (proof) {
    for (let i = findings.length - 1; i >= 0; i--)
      if (
        ["NO_SOURCE", "PROFESSIONAL_BASIS", "GUARANTEE_QUESTION"].includes(
          findings[i].code,
        )
      )
        findings.splice(i, 1);
  } else if (claims.length) {
    // Per-claim issues are more actionable than an identical aggregate source warning.
    for (let i = findings.length - 1; i >= 0; i--)
      if (findings[i].code === "NO_SOURCE") findings.splice(i, 1);
  }
  const links = await tx.articleFaqRelation.findMany({
    where: { articleId: article.id },
    include: {
      faq: {
        include: {
          reviews: {
            where: { decision: "APPROVED" },
            select: { revision: true, checklist: true },
          },
        },
      },
    },
  });
  for (const l of links) {
    const f = l.faq;
    const snapshot = f.publishedSnapshot as {
      question?: string;
      answer?: string;
      sources?: unknown;
    } | null;
    const useCurrent =
      l.evidenceMode === "approved" &&
      f.status === "APPROVED" &&
      f.revision === l.revision;
    const usePublished =
      f.isLive && f.publishedRevision === l.revision && !!snapshot;
    if (
      !f.reviews.some((r) => r.revision === l.revision) ||
      !(await usableFaq(
        tx,
        {
          question: useCurrent ? f.question : snapshot?.question || "",
          answer: useCurrent ? f.answer : snapshot?.answer || "",
          sources: useCurrent ? f.sources : snapshot?.sources,
        },
        f.reviews.find((r) => r.revision === l.revision)?.checklist,
      )) ||
      (!useCurrent && !usePublished)
    )
      findings.push({
        severity: "MUST_FIX",
        code: "FAQ_CHANGED",
        objectId: f.id,
        location: `关联FAQ：${f.question}`,
        message: `关联问答“${f.question}”（引用版本${l.revision}）已变更或失去审核资格，请核对版本与审核记录，不能自动采纳新答案。`,
      });
  }
  const unique = findings.filter(
    (f, index, all) =>
      all.findIndex(
        (other) =>
          other.code === f.code &&
          other.objectId === f.objectId &&
          other.location === f.location,
      ) === index,
  );
  const order = { MUST_FIX: 0, VERIFY: 1, SUGGESTION: 2 };
  unique.sort((a, b) => order[a.severity] - order[b.severity]);
  for (const f of unique) {
    f.key = createHash("sha256")
      .update(JSON.stringify([f.code, f.objectId, f.excerpt, f.location]))
      .digest("hex");
    if (f.excerpt) {
      const i = article.content.indexOf(f.excerpt);
      if (i >= 0) f.line = article.content.slice(0, i).split("\n").length;
    }
  }
  if (enforce && unique.some((f) => f.severity === "MUST_FIX"))
    throw new HttpError(
      409,
      "COMPLIANCE_REQUIRED",
      "草稿仍有必须修复的问题，请先查看事实与合规检查。",
      unique,
    );
  return unique;
}
export async function recordPublishedSources(
  tx: Prisma.TransactionClient,
  article: {
    id: string;
    generationMetadata: unknown;
    revision: number;
    sources: unknown;
  },
) {
  if (!article.generationMetadata) return;
  const sources = article.sources as Snapshot["sources"];
  await tx.articleSource.deleteMany({
    where: { articleId: article.id, revision: article.revision },
  });
  for (const s of sources) {
    const catalog = await tx.articleSource.findFirst({
      where: {
        articleId: null,
        catalogId: null,
        sourceType: { not: "INTERNAL_BANK" },
        sourceUrl: s.url,
        isActive: true,
        verifiedById: { not: null },
        verifiedAt: { not: null },
        OR: [{ validUntil: null }, { validUntil: { gte: new Date() } }],
      },
    });
    if (!catalog) continue; // Drafts may be incomplete; publication checks reject missing sources.
    await tx.articleSource.create({
      data: {
        articleId: article.id,
        revision: article.revision,
        catalogId: catalog.id,
        title: catalog.title,
        sourceUrl: catalog.sourceUrl,
        excerpt: catalog.excerpt,
        paragraph: s.paragraph,
        verifiedAt: catalog.verifiedAt,
        validUntil: catalog.validUntil,
        verifiedById: catalog.verifiedById,
      },
    });
  }
}
