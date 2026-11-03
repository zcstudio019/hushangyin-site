import "server-only";
import { createHash } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { can } from "@/lib/auth/permissions";
import { recheckFaqRisk } from "@/features/geo/risk-evidence";
export type FactArticle = {
  id: string;
  title?: string;
  content: string;
  sources: unknown;
  revision: number;
  authorId?: string | null;
  editorId?: string | null;
  submittedById?: string | null;
};
export const factFingerprint = (a: FactArticle) =>
  createHash("sha256")
    .update(JSON.stringify([a.id, a.revision, a.title, a.content, a.sources]))
    .digest("hex");
export const asRiskContent = (a: FactArticle) => ({
  question: a.title || "",
  answer: a.content,
  sources: a.sources,
});
export async function factIndependent(
  tx: Prisma.TransactionClient,
  a: FactArticle,
  actorId: string,
) {
  const u = await tx.adminUser.findUnique({ where: { id: actorId } });
  const version = await tx.articleVersion.findUnique({
    where: { articleId_revision: { articleId: a.id, revision: a.revision } },
    select: { editorId: true },
  });
  const submitted = await tx.auditLog.findMany({
    where: {
      action: "CONTENT_SUBMIT",
      resourceType: "geo_articles",
      resourceId: a.id,
      metadata: { path: ["revision"], equals: a.revision },
    },
    select: { actorId: true },
  });
  return (
    !!u &&
    u.isActive &&
    !u.mustChangePassword &&
    can(u, "content.review") &&
    ![
      a.authorId,
      a.editorId,
      a.submittedById,
      version?.editorId,
      ...submitted.map((s) => s.actorId),
    ].includes(actorId)
  );
}
export async function factApproval(
  tx: Prisma.TransactionClient,
  a: FactArticle,
) {
  const review = await tx.contentReview.findUnique({
    where: { articleId_revision: { articleId: a.id, revision: a.revision } },
  });
  if (
    review?.decision === "APPROVED" &&
    (await factIndependent(tx, a, review.reviewerId))
  ) {
    try {
      if (await recheckFaqRisk(tx, asRiskContent(a), review.checklist))
        return {
          accepted: true,
          riskAssessment: (review.checklist as { riskAssessment?: unknown })
            .riskAssessment,
        };
    } catch {
      /* evidence must be rechecked */
    }
  }
  const decisions = await tx.auditLog.findMany({
    where: {
      action: "ARTICLE_FACT_DECISION",
      resourceType: "geo_articles",
      resourceId: a.id,
      metadata: { path: ["revision"], equals: a.revision },
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  const fingerprint = factFingerprint(a);
  for (const d of decisions) {
    const m = d.metadata as {
      fingerprint?: string;
      accepted?: boolean;
      riskAssessment?: unknown;
    } | null;
    if (m?.fingerprint !== fingerprint) continue;
    if (!m.accepted || !d.actorId || !(await factIndependent(tx, a, d.actorId)))
      return null;
    try {
      if (
        await recheckFaqRisk(tx, asRiskContent(a), {
          riskAssessment: m.riskAssessment,
        })
      )
        return m;
    } catch {
      return null; /* changed evidence remains blocked */
    }
    return null;
  }
  return null;
}
