import { checkFaqRisk, recheckFaqRisk } from "./risk-evidence";
import { asRiskContent } from "@/features/generation/article-evidence";
import { classifyFaq, faqNeedsEvidence } from "./risk";
import { reviewInputIssue } from "./workflow-feedback";
import { auditReviewInvalidation, reviewPolicy } from "./review-policy";
import "server-only";
import { saveFaqVersion } from "./faq-versions";
import { can } from "@/lib/auth/permissions";
import {
  recalculateQuestion,
  questionStatus,
  recalculateQuestions,
} from "@/features/generation/question-state";
import {
  checkGeneratedArticle,
  recordPublishedSources,
} from "@/features/generation/article-check";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { HttpError } from "@/lib/http";
import { parseGeo as parse } from "./errors";
import type { Actor } from "@/lib/auth/session";
import {
  articleSchema,
  faqSchema,
  questionSchema,
  workflowSchema,
  sourceSchema,
  type Snapshot,
} from "./validation";
import { contentStatuses, categories } from "./config";
import { z } from "zod";
function requireCurrentSources(input: unknown) {
  const parsed = z.array(sourceSchema).min(1).safeParse(input);
  const today = new Date(Date.now() + 8 * 3600 * 1000)
    .toISOString()
    .slice(0, 10);
  if (
    !parsed.success ||
    parsed.data.some(
      (s) => s.checkedAt > today || (s.validUntil && s.validUntil < today),
    )
  )
    throw new HttpError(
      400,
      "SOURCE_REQUIRED",
      "需填写已核验且在适用时间内的引用来源。",
    );
}
export type Kind = "articles" | "faqs" | "questions";
export function kindOf(value: string): Kind {
  if (!["articles", "faqs", "questions"].includes(value))
    throw new HttpError(404, "NOT_FOUND", "内容类型不存在。");
  return value as Kind;
}
const json = (v: unknown) =>
  JSON.parse(JSON.stringify(v)) as Prisma.InputJsonValue;
const authorSelect = { select: { name: true } };
export async function contentItem(kind: Kind, id: string) {
  const item =
    kind === "articles"
      ? await db().article.findUnique({
          where: { id },
          include: {
            author: authorSelect,
            editor: authorSelect,
            relatedFrom: { select: { toId: true } },
            versions: {
              select: { revision: true, createdAt: true },
              orderBy: { revision: "desc" },
            },
            reviews: {
              include: { reviewer: authorSelect },
              orderBy: { createdAt: "desc" },
            },
          },
        })
      : kind === "faqs"
        ? await db().faq.findUnique({
            where: { id },
            include: {
              author: authorSelect,
              editor: authorSelect,
              versions: {
                select: { revision: true, createdAt: true },
                orderBy: { revision: "desc" },
              },
              reviews: {
                include: { reviewer: authorSelect },
                orderBy: { createdAt: "desc" },
              },
            },
          })
        : await db().geoQuestion.findUnique({ where: { id } });
  if (!item) throw new HttpError(404, "NOT_FOUND", "内容不存在。");
  return item;
}
export async function contentList(
  kind: Kind,
  query: Record<string, string | undefined>,
) {
  const q = query.q?.slice(0, 100),
    page = Math.max(
      1,
      Math.min(10000, Number.parseInt(query.page || "1") || 1),
    ),
    skip = (page - 1) * 25;
  const status =
    kind === "questions"
      ? ["OPEN", "PLANNED", "ANSWERED", "ARCHIVED"]
      : Object.keys(contentStatuses);
  const filter = {
    ...(categories.includes(query.category as (typeof categories)[number])
      ? { category: query.category }
      : {}),
    ...(query.status && status.includes(query.status)
      ? { status: query.status }
      : {}),
  };
  if (kind === "articles") {
    const where = {
      ...filter,
      ...(q
        ? {
            OR: [
              { title: { contains: q, mode: "insensitive" as const } },
              { tags: { has: q } },
            ],
          }
        : {}),
    } as Prisma.ArticleWhereInput;
    const [items, total] = await db().$transaction([
      db().article.findMany({
        where,
        take: 25,
        skip,
        orderBy: { updatedAt: "desc" },
        select: {
          id: true,
          title: true,
          slug: true,
          status: true,
          isLive: true,
          category: true,
          revision: true,
          reviews: {
            select: { decision: true, revision: true },
            orderBy: { createdAt: "desc" },
            take: 1,
          },
          updatedAt: true,
          publishedAt: true,
          author: authorSelect,
        },
      }),
      db().article.count({ where }),
    ]);
    return { items, total, page };
  }
  if (kind === "faqs") {
    const where = {
      ...filter,
      ...(q ? { question: { contains: q, mode: "insensitive" as const } } : {}),
    } as Prisma.FaqWhereInput;
    const [items, total] = await db().$transaction([
      db().faq.findMany({
        where,
        take: 25,
        skip,
        orderBy: { updatedAt: "desc" },
        select: {
          id: true,
          question: true,
          status: true,
          isLive: true,
          category: true,
          revision: true,
          reviews: {
            select: { decision: true, revision: true },
            orderBy: { createdAt: "desc" },
            take: 1,
          },
          updatedAt: true,
        },
      }),
      db().faq.count({ where }),
    ]);
    return { items, total, page };
  }
  const where = {
    ...filter,
    ...(q ? { question: { contains: q, mode: "insensitive" as const } } : {}),
  } as Prisma.GeoQuestionWhereInput;
  const [items, total] = await db().$transaction([
    db().geoQuestion.findMany({
      where,
      take: 25,
      skip,
      orderBy: [{ priority: "asc" }, { updatedAt: "desc" }],
      include: {
        _count: { select: { articleLinks: true } },
        articleLinks: { select: { article: { select: { isLive: true } } } },
      },
    }),
    db().geoQuestion.count({ where }),
  ]);
  return { items, total, page };
}
import { geoWrite as write, geoAudit as audit } from "./write";
async function linkExists(tx: Prisma.TransactionClient, id: string | null) {
  if (
    id &&
    !(await tx.article.findUnique({ where: { id }, select: { id: true } }))
  )
    throw new HttpError(400, "ARTICLE_INVALID", "关联文章不存在。");
}
function conflict(
  old: { revision: number; status?: string },
  revision: number | undefined,
) {
  if (old.revision !== revision)
    throw new HttpError(
      409,
      "STALE_VERSION",
      `你操作的是版本${revision ?? "未知"}，服务器已是版本${old.revision}。请先查看最新版本差异，不会覆盖他人修改。`,
      {
        expectedRevision: revision,
        actualRevision: old.revision,
        actualStatus: old.status,
      },
    );
}
export async function saveContent(
  actor: Actor,
  kind: Kind,
  input: unknown,
  id?: string,
) {
  if (kind === "questions") {
    const v = parse(questionSchema, input);
    return write(
      actor,
      id ? "content.update" : "content.create",
      async (tx) => {
        await linkExists(tx, v.articleId);
        const old = id
          ? await tx.geoQuestion.findUnique({ where: { id } })
          : null;
        if (id && !old) throw new HttpError(404, "NOT_FOUND", "问题不存在。");
        const live = await tx.articleQuestionRelation.findFirst({
          where: {
            questionId: id || "",
            article: {
              isLive: true,
              publishedSnapshot: { not: Prisma.JsonNull },
            },
          },
        });
        const selected = v.articleId
          ? await tx.article.findUnique({
              where: { id: v.articleId },
              select: { isLive: true, publishedSnapshot: true },
            })
          : null;
        if (
          v.status === "ANSWERED" &&
          !live &&
          !(selected?.isLive && selected.publishedSnapshot)
        )
          throw new HttpError(
            400,
            "PUBLIC_ANSWER_REQUIRED",
            "没有有效已发布解答，不能标记为已解答。请先关联文章并完成审核发布。",
          );
        const item = id
          ? await tx.geoQuestion.update({
              where: { id },
              data: { ...v, status: old!.status },
            })
          : await tx.geoQuestion.create({ data: { ...v, status: "OPEN" } });
        await questionStatus(
          tx,
          item.id,
          v.status !== "ARCHIVED" &&
            (live || (selected?.isLive && selected.publishedSnapshot))
            ? "ANSWERED"
            : v.status,
          actor.id,
          "manual",
        );
        if (v.articleId)
          await tx.articleQuestionRelation.upsert({
            where: {
              articleId_questionId: {
                articleId: v.articleId,
                questionId: item.id,
              },
            },
            create: {
              articleId: v.articleId,
              questionId: item.id,
              relationType: "PRIMARY",
            },
            update: {},
          });
        await recalculateQuestion(tx, item.id, actor.id);
        await audit(tx, actor, "QUESTION_SAVE", kind, item.id);
        return tx.geoQuestion.findUniqueOrThrow({ where: { id: item.id } });
      },
    );
  }
  if (kind === "faqs") {
    const v = parse(faqSchema, input);
    return write(
      actor,
      id ? "content.update" : "content.create",
      async (tx) => {
        await linkExists(tx, v.articleId);
        const old = id ? await tx.faq.findUnique({ where: { id } }) : null;
        if (id && !old) throw new HttpError(404, "NOT_FOUND", "问答不存在。");
        if (old) {
          conflict(old, v.revision);
          if (old.status === "IN_REVIEW")
            throw new HttpError(409, "REVIEW_LOCKED", "请先撤回审核再编辑。");
        }
        const data = {
          question: v.question,
          answer: v.answer,
          category: v.category,
          articleId: v.articleId,
          sources: json(v.sources),
          editorId: actor.id,
          submittedAt: null,
          submittedById: null,
          reviewAssigneeId: null,
          reviewAssignedRevision: null,
          reviewAssignedAt: null,
          status: "DRAFT" as const,
          revision: (old?.revision || 0) + 1,
        };
        const item = old
          ? await tx.faq.update({ where: { id: old.id }, data })
          : await tx.faq.create({ data: { ...data, authorId: actor.id } });
        if (old) await auditReviewInvalidation(tx, actor, "faqs", item.id, old);
        await saveFaqVersion(tx, item, actor.id);
        await audit(tx, actor, "FAQ_SAVE", kind, item.id, {
          revision: item.revision,
        });
        return item;
      },
    );
  }
  const v = parse(articleSchema, input);
  return write(actor, id ? "content.update" : "content.create", async (tx) => {
    const old = id ? await tx.article.findUnique({ where: { id } }) : null;
    if (id && !old) throw new HttpError(404, "NOT_FOUND", "文章不存在。");
    if (old) {
      conflict(old, v.revision);
      if (old.status === "IN_REVIEW")
        throw new HttpError(409, "REVIEW_LOCKED", "请先撤回审核再编辑。");
      if (
        (old.publishedAt || old.isLive || old.publishedSnapshot) &&
        old.slug !== v.slug
      )
        throw new HttpError(
          409,
          "URL_LOCKED",
          "文章公开网址已固定，不可修改。",
        );
    }
    if (
      v.questionId &&
      (id ||
        !(await tx.geoQuestion.findFirst({
          where: { id: v.questionId, status: { not: "ARCHIVED" } },
        })))
    )
      throw new HttpError(
        400,
        "QUESTION_INVALID",
        "选题不存在、已归档或不能在编辑文章时更换来源问题。",
      );
    const relatedIds = [...new Set(v.relatedIds)];
    if (id && relatedIds.includes(id))
      throw new HttpError(400, "SELF_RELATION", "不能关联文章自身。");
    if (
      (await tx.article.count({ where: { id: { in: relatedIds } } })) !==
      relatedIds.length
    )
      throw new HttpError(400, "ARTICLE_INVALID", "关联文章不存在。");
    const data = {
      title: v.title,
      slug: v.slug,
      summary: v.summary,
      content: v.content,
      category: v.category,
      tags: v.tags,
      sources: json(v.sources),
      aiAssisted: old?.generationMetadata ? true : v.aiAssisted,
      seoTitle: v.seoTitle || null,
      metaDescription: v.metaDescription || null,
      contentFormat: "MARKDOWN",
      editorId: actor.id,
      status: "DRAFT" as const,
      submittedAt: null,
      submittedById: null,
      reviewAssigneeId: null,
      reviewAssignedRevision: null,
      reviewAssignedAt: null,
      revision: (old?.revision || 0) + 1,
    };
    const item = old
      ? await tx.article.update({ where: { id: old.id }, data })
      : await tx.article.create({ data: { ...data, authorId: actor.id } });
    if (old) await auditReviewInvalidation(tx, actor, "articles", item.id, old);
    if (v.questionId) {
      await tx.articleQuestionRelation.create({
        data: {
          articleId: item.id,
          questionId: v.questionId,
          relationType: "PRIMARY",
        },
      });
      await recalculateQuestions(tx, item.id, actor.id);
    }
    if (item.generationMetadata) {
      await recordPublishedSources(tx, item);
      const findings = await checkGeneratedArticle(tx, item, false);
      await tx.article.update({
        where: { id: item.id },
        data: { complianceReport: json({ revision: item.revision, findings }) },
      });
    }
    await tx.articleRelation.deleteMany({ where: { fromId: item.id } });
    if (relatedIds.length)
      await tx.articleRelation.createMany({
        data: relatedIds.map((toId) => ({ fromId: item.id, toId })),
      });
    const author = await tx.adminUser.findUnique({
      where: { id: item.authorId || actor.id },
      select: { name: true },
    });
    const snapshotInput = { ...v };
    delete snapshotInput.revision; // The request's optimistic-lock revision is not the saved version.
    const snapshot: Snapshot = {
      ...snapshotInput,
      relatedIds,
      contentFormat: "MARKDOWN",
      authorName: author?.name || null,
    };
    await tx.articleVersion.create({
      data: {
        articleId: item.id,
        revision: item.revision,
        snapshot: json(snapshot),
        editorId: actor.id,
      },
    });
    await audit(tx, actor, "ARTICLE_SAVE", kind, item.id, {
      revision: item.revision,
    });
    return item;
  });
}
export { importQuestions } from "./import-service";
export async function workflow(
  actor: Actor,
  kind: Kind,
  id: string,
  input: unknown,
) {
  if (kind === "questions")
    throw new HttpError(400, "INVALID_ACTION", "问题请使用状态字段归档。");
  const v = parse(workflowSchema, input);
  const permission =
    v.action === "approve" || v.action === "reject"
      ? "content.review"
      : v.action === "publish"
        ? "content.publish"
        : v.action === "offline"
          ? "content.unpublish"
          : "content.update";
  return write(actor, permission, async (tx) => {
    const old =
      kind === "articles"
        ? await tx.article.findUnique({
            where: { id },
            include: {
              author: authorSelect,
              relatedFrom: { select: { toId: true } },
            },
          })
        : await tx.faq.findUnique({
            where: { id },
            include: { author: authorSelect },
          });
    if (!old) throw new HttpError(404, "NOT_FOUND", "内容不存在。");
    conflict(old, v.revision);
    if (v.action === "submit" && old.status === "IN_REVIEW")
      return {
        revision: old.revision,
        status: old.status,
        alreadySubmitted: true,
      };
    if (
      kind === "articles" &&
      ["submit", "approve", "publish"].includes(v.action)
    ) {
      const article = old as Prisma.ArticleGetPayload<object>;
      await checkGeneratedArticle(tx, article, true);
    }
    const save = async (
      data: Prisma.ArticleUpdateInput & Prisma.FaqUpdateInput,
    ) =>
      kind === "articles"
        ? tx.article.update({ where: { id }, data })
        : tx.faq.update({ where: { id }, data });
    if (v.action === "restore") {
      if (kind !== "articles" || !v.version)
        throw new HttpError(400, "VERSION_REQUIRED", "请选择文章历史版本。");
      if (old.status === "IN_REVIEW")
        throw new HttpError(409, "REVIEW_LOCKED", "请先撤回审核。");
      const version = await tx.articleVersion.findUnique({
        where: { articleId_revision: { articleId: id, revision: v.version } },
      });
      if (!version) throw new HttpError(404, "NOT_FOUND", "历史版本不存在。");
      const s = version.snapshot as unknown as Snapshot;
      const current = old as Prisma.ArticleGetPayload<object>;
      const revision = old.revision + 1;
      const restored = { ...s, slug: current.slug, contentFormat: "MARKDOWN" };
      delete restored.legacyHtml;
      await tx.article.update({
        where: { id },
        data: {
          title: s.title,
          summary: s.summary,
          content: s.content,
          category: s.category,
          tags: s.tags,
          sources: json(s.sources.filter((x) => x.checkedAt)),
          seoTitle: s.seoTitle || null,
          metaDescription: s.metaDescription || null,
          aiAssisted: s.aiAssisted,
          contentFormat: "MARKDOWN",
          status: "DRAFT",
          reviewAssigneeId: null,
          reviewAssignedRevision: null,
          reviewAssignedAt: null,
          revision,
          editorId: actor.id,
        },
      });
      await tx.articleRelation.deleteMany({ where: { fromId: id } });
      const validRelated = await tx.article.findMany({
        where: { id: { in: s.relatedIds }, NOT: { id } },
        select: { id: true },
      });
      if (validRelated.length)
        await tx.articleRelation.createMany({
          data: validRelated.map((r) => ({ fromId: id, toId: r.id })),
        });
      restored.relatedIds = validRelated.map((r) => r.id);
      await tx.articleVersion.create({
        data: {
          articleId: id,
          revision,
          snapshot: json(restored),
          editorId: actor.id,
        },
      });
      await audit(tx, actor, "ARTICLE_RESTORE", kind, id, {
        revision,
        fromVersion: v.version,
      });
      const restoredArticle = await tx.article.findUniqueOrThrow({
        where: { id },
      });
      await recordPublishedSources(tx, restoredArticle);
      await auditReviewInvalidation(tx, actor, "articles", id, old);
      return { revision, status: "DRAFT" };
    }
    if (v.action === "submit") {
      if (old.status !== "DRAFT")
        throw new HttpError(409, "STATE_INVALID", "仅草稿可以提交审核。");
      const rejection = await tx.contentReview.findFirst({
        where: {
          ...(kind === "articles" ? { articleId: id } : { faqId: id }),
          decision: "REJECTED",
        },
        orderBy: { createdAt: "desc" },
      });
      if (rejection?.revision === old.revision - 1)
        throw new HttpError(
          409,
          "REJECTED_EDIT_REQUIRED",
          "请先根据驳回原因修改并保存新版本，再重新提交审核。",
        );
      if (kind === "faqs" && !(old as { answer: string }).answer.trim())
        throw new HttpError(
          400,
          "ANSWER_REQUIRED",
          "FAQ必须填写实际答案才能提交审核。",
        );
      await save({
        status: "IN_REVIEW",
        submittedAt: new Date(),
        submittedBy: { connect: { id: actor.id } },
      });
    } else if (v.action === "approve" || v.action === "reject") {
      if (old.status !== "IN_REVIEW")
        throw new HttpError(409, "STATE_INVALID", "仅待审核内容可执行审核。");
      const policy = await reviewPolicy(tx, kind, id, actor);
      if (!policy.canReview)
        throw new HttpError(
          403,
          policy.selfReview
            ? "INDEPENDENT_REVIEW"
            : policy.assignmentValid
              ? "REVIEW_ASSIGNED_TO_OTHER"
              : "REVIEW_ASSIGNMENT_INVALID",
          policy.reason,
        );
      const issue = reviewInputIssue(
        kind === "faqs" &&
          v.risk &&
          v.risk.level !== "HIGH" &&
          v.action === "approve"
          ? "reject"
          : v.action,
        v.note || "",
        v.checklist || {},
      );
      if (issue) throw new HttpError(400, issue.code, issue.message);
      if (v.action === "approve") {
        if (kind === "faqs") {
          const findings = classifyFaq(
            (old as { question: string }).question,
            (old as { answer: string }).answer,
          );
          if (findings.blockers.length)
            throw new HttpError(
              400,
              "CONTENT_RISK",
              findings.blockers.join("；"),
            );
        }
        if (kind === "faqs" && !(old as { answer: string }).answer.trim())
          throw new HttpError(
            400,
            "ANSWER_REQUIRED",
            "FAQ答案为空，须补充实际答案后重新提交审核。",
          );
        if (!v.risk) {
          if (
            kind === "faqs" &&
            faqNeedsEvidence(
              (old as { question: string }).question,
              (old as { answer: string }).answer,
            )
          )
            throw new HttpError(
              400,
              "RISK_CONFIRM_REQUIRED",
              "此版本包含具体主张，请使用风险分级审核并逐项关联证据。",
            );
          requireCurrentSources(old.sources);
        }
      }
      const riskAssessment =
        v.action === "approve" && v.risk
          ? await checkFaqRisk(
              tx,
              kind === "faqs"
                ? (old as {
                    question: string;
                    answer: string;
                    sources: unknown;
                  })
                : asRiskContent(old as Prisma.ArticleGetPayload<object>),
              v.risk,
            )
          : null;
      await tx.contentReview.create({
        data: {
          ...(kind === "articles" ? { articleId: id } : { faqId: id }),
          revision: old.revision,
          reviewerId: actor.id,
          decision: v.action === "approve" ? "APPROVED" : "REJECTED",
          note: (v.note || "").trim(),
          checklist: json({
            ...(v.checklist || {}),
            ...(riskAssessment ? { comprehensive: true, riskAssessment } : {}),
          }),
        },
      });
      if (v.action === "approve") await save({ status: "APPROVED" });
      else {
        await save({
          status: "DRAFT",
          revision: old.revision + 1,
          reviewAssignee: { disconnect: true },
          reviewAssignedRevision: null,
          reviewAssignedAt: null,
        });
        if (kind === "articles") {
          const previous = await tx.articleVersion.findUniqueOrThrow({
            where: {
              articleId_revision: { articleId: id, revision: old.revision },
            },
          });
          await tx.articleVersion.create({
            data: {
              articleId: id,
              revision: old.revision + 1,
              snapshot: previous.snapshot as Prisma.InputJsonValue,
              editorId: old.editorId,
            },
          });
        }
      }
    } else if (v.action === "publish") {
      if (kind === "faqs") {
        const findings = classifyFaq(
          (old as { question: string }).question,
          (old as { answer: string }).answer,
        );
        if (findings.blockers.length)
          throw new HttpError(
            400,
            "CONTENT_RISK",
            findings.blockers.join("；"),
          );
      }
      const review = await tx.contentReview.findFirst({
        where: {
          ...(kind === "articles" ? { articleId: id } : { faqId: id }),
          revision: old.revision,
          decision: "APPROVED",
        },
      });
      if (old.status !== "APPROVED" || !review)
        throw new HttpError(
          409,
          "APPROVAL_REQUIRED",
          "当前版本必须先通过人工审核。",
        );
      if (
        !(await recheckFaqRisk(
          tx,
          kind === "faqs"
            ? (old as { question: string; answer: string; sources: unknown })
            : asRiskContent(old as Prisma.ArticleGetPayload<object>),
          review.checklist,
        ))
      ) {
        if (
          kind === "faqs" &&
          faqNeedsEvidence(
            (old as { question: string }).question,
            (old as { answer: string }).answer,
          )
        )
          throw new HttpError(
            409,
            "RISK_REVIEW_REQUIRED",
            "旧版审核包含具体高风险主张，请按风险分级重新核验后发布。",
          );
        requireCurrentSources(old.sources);
      }
      if (kind === "articles")
        await recordPublishedSources(
          tx,
          old as Prisma.ArticleGetPayload<object>,
        );
      const now = new Date(),
        publishedAt = old.publishedAt || now;
      const snapshot =
        kind === "articles"
          ? {
              title: (old as { title: string }).title,
              seoTitle: (old as Prisma.ArticleGetPayload<object>).seoTitle,
              metaDescription: (old as Prisma.ArticleGetPayload<object>)
                .metaDescription,
              slug: (old as { slug: string }).slug,
              summary: (old as { summary: string }).summary,
              content: (old as { content: string }).content,
              category: old.category,
              tags: (old as { tags: string[] }).tags,
              sources: old.sources,
              contentFormat: "MARKDOWN",
              authorName: old.author?.name || null,
              publishedAt: publishedAt.toISOString(),
              modifiedAt: now.toISOString(),
              relatedIds: (
                old as { relatedFrom: { toId: string }[] }
              ).relatedFrom.map((r) => r.toId),
              aiAssisted: (old as { aiAssisted: boolean }).aiAssisted,
            }
          : {
              question: (old as { question: string }).question,
              answer: (old as { answer: string }).answer,
              category: old.category,
              articleId: (old as { articleId: string | null }).articleId,
              sources: old.sources,
              authorName: old.author?.name || null,
              publishedAt: publishedAt.toISOString(),
              modifiedAt: now.toISOString(),
            };
      await save({
        status: "PUBLISHED",
        isLive: true,
        publishedAt,
        publishedSnapshot: json(snapshot),
        publishedRevision: old.revision,
      });
    } else if (v.action === "offline") {
      if (!old.isLive)
        throw new HttpError(409, "STATE_INVALID", "当前没有线上版本。");
      await save({ status: "ARCHIVED", isLive: false });
    } else if (v.action === "withdraw") {
      if (
        ![old.authorId, old.editorId, old.submittedById].includes(actor.id) &&
        !can(actor, "content.review")
      )
        throw new HttpError(
          403,
          "WITHDRAW_FORBIDDEN",
          "仅作者、编辑人、提交人或审核管理员可以撤回审核。",
        );
      if (old.status !== "IN_REVIEW")
        throw new HttpError(409, "STATE_INVALID", "当前不在审核中。");
      await save({
        status: "DRAFT",
        revision: old.revision + 1,
        reviewAssignee: { disconnect: true },
        reviewAssignedRevision: null,
        reviewAssignedAt: null,
      });
      if (kind === "articles") {
        const previous = await tx.articleVersion.findUniqueOrThrow({
          where: {
            articleId_revision: { articleId: id, revision: old.revision },
          },
        });
        await tx.articleVersion.create({
          data: {
            articleId: id,
            revision: old.revision + 1,
            snapshot: previous.snapshot as Prisma.InputJsonValue,
            editorId: actor.id,
          },
        });
      }
    }
    if (["withdraw", "reject"].includes(v.action))
      await auditReviewInvalidation(tx, actor, kind, id, old);
    if (kind === "articles" && ["withdraw", "reject"].includes(v.action))
      await recordPublishedSources(
        tx,
        await tx.article.findUniqueOrThrow({ where: { id } }),
      );
    if (kind === "articles" && ["publish", "offline"].includes(v.action))
      await recalculateQuestions(tx, id, actor.id);
    if (kind === "faqs")
      await saveFaqVersion(
        tx,
        await tx.faq.findUniqueOrThrow({ where: { id } }),
        actor.id,
      );
    await audit(tx, actor, "CONTENT_" + v.action.toUpperCase(), kind, id, {
      revision: old.revision,
      ...(v.risk ? { riskLevel: v.risk.level, policyVersion: "risk-v1" } : {}),
    });
    return { status: v.action };
  }).catch(async (error: unknown) => {
    if (
      error instanceof HttpError &&
      [
        "INDEPENDENT_REVIEW",
        "WITHDRAW_FORBIDDEN",
        "APPROVAL_REQUIRED",
        "REVIEW_ASSIGNED_TO_OTHER",
        "REVIEW_ASSIGNMENT_INVALID",
      ].includes(error.code)
    )
      await db().auditLog.create({
        data: {
          actorId: actor.id,
          action: "CONTENT_POLICY_DENIED",
          resourceType: "geo_" + kind,
          resourceId: id,
          metadata: {
            action: v.action,
            code: error.code,
            revision: v.revision,
          },
        },
      });
    throw error;
  });
}
