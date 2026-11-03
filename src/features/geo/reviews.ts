import type { Actor } from "@/lib/auth/session";
import { reviewPolicy, reviewAccountPool } from "./review-policy";
import "server-only";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
export async function reviewQueue(
  query: Record<string, string | undefined>,
  actor: Actor,
) {
  const view = ["pending", "ready", "approved", "rejected", "history"].includes(
    query.view || "",
  )
    ? query.view!
    : "pending";
  const page = Math.max(
      1,
      Math.min(1000, Number.parseInt(query.page || "1") || 1),
    ),
    q = query.q?.slice(0, 100) || "";
  const type = ["articles", "faqs"].includes(query.type || "")
    ? query.type
    : undefined;
  if (view === "pending" || view === "ready") {
    const aw: Prisma.ArticleWhereInput = {
        status: view === "pending" ? "IN_REVIEW" : "APPROVED",
        ...(q ? { title: { contains: q } } : {}),
        ...(query.mine === "true" ? { reviewAssigneeId: actor.id } : {}),
      },
      fw: Prisma.FaqWhereInput = {
        status: view === "pending" ? "IN_REVIEW" : "APPROVED",
        ...(q ? { question: { contains: q } } : {}),
        ...(query.mine === "true" ? { reviewAssigneeId: actor.id } : {}),
      };
    const include = {
      author: { select: { name: true } },
      editor: { select: { name: true } },
      submittedBy: { select: { name: true } },
    };
    const [articles, faqs, ac, fc] = await Promise.all([
      type === "faqs"
        ? []
        : db().article.findMany({
            where: aw,
            include,
            orderBy: [
              { submittedAt: { sort: "desc", nulls: "last" } },
              { updatedAt: "desc" },
            ],
            take: 25,
            skip: (page - 1) * 25,
          }),
      type === "articles"
        ? []
        : db().faq.findMany({
            where: fw,
            include,
            orderBy: [
              { submittedAt: { sort: "desc", nulls: "last" } },
              { updatedAt: "desc" },
            ],
            take: 25,
            skip: (page - 1) * 25,
          }),
      type === "faqs" ? 0 : db().article.count({ where: aw }),
      type === "articles" ? 0 : db().faq.count({ where: fw }),
    ]);
    const pool = await reviewAccountPool(db());
    const items = [
      ...articles.map((a) => ({
        id: a.id,
        kind: "articles",
        title: a.title,
        author: a.author?.name,
        submitter: a.submittedBy?.name,
        submittedAt: a.submittedAt,
        importedAt: null as string | null,
        revision: a.revision,
        status: a.status,
        review: null,
      })),
      ...faqs.map((f) => ({
        id: f.id,
        kind: "faqs",
        title: f.question,
        author: f.author?.name,
        submitter: f.submittedBy?.name,
        submittedAt: f.submittedAt,
        importedAt:
          (f.importMetadata as { importedAt?: string } | null)?.importedAt ||
          null,
        revision: f.revision,
        status: f.status,
        review: null,
      })),
    ];
    return {
      view,
      page,
      total: ac + fc,
      hasNext: ac > page * 25 || fc > page * 25,
      items: await Promise.all(
        items.map(async (item) => ({
          ...item,
          policy:
            view === "pending"
              ? await reviewPolicy(
                  db(),
                  item.kind as "articles" | "faqs",
                  item.id,
                  actor,
                  pool,
                )
              : null,
        })),
      ),
    };
  }
  const where: Prisma.ContentReviewWhereInput = {
    ...(view === "approved"
      ? { decision: "APPROVED" }
      : view === "rejected"
        ? { decision: "REJECTED" }
        : {}),
    ...(type === "articles"
      ? { articleId: { not: null } }
      : type === "faqs"
        ? { faqId: { not: null } }
        : {}),
    ...(q
      ? {
          OR: [
            { article: { title: { contains: q } } },
            { faq: { question: { contains: q } } },
          ],
        }
      : {}),
  };
  const [rows, total] = await db().$transaction([
    db().contentReview.findMany({
      where,
      include: {
        reviewer: { select: { name: true } },
        article: { include: { author: { select: { name: true } } } },
        faq: { include: { author: { select: { name: true } } } },
      },
      orderBy: { createdAt: "desc" },
      take: 25,
      skip: (page - 1) * 25,
    }),
    db().contentReview.count({ where }),
  ]);
  return {
    view,
    page,
    total,
    hasNext: page * 25 < total,
    items: rows.flatMap((r) => {
      const c = r.article || r.faq;
      if (!c) return [];
      return [
        {
          id: c.id,
          kind: r.article ? "articles" : "faqs",
          title: r.article?.title || r.faq!.question,
          author: c.author?.name,
          submitter: undefined,
          submittedAt: c.submittedAt,
          importedAt: null as string | null,
          revision: c.revision,
          status: c.status,
          policy: null,
          review: {
            id: r.id,
            revision: r.revision,
            decision: r.decision,
            note: r.note,
            reviewer: r.reviewer.name,
            createdAt: r.createdAt,
          },
        },
      ];
    }),
  };
}
