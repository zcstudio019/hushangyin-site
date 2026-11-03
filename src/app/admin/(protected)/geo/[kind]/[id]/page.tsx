import { classifyFaq } from "@/features/geo/risk";
import { ContentEditingSession } from "@/components/forms/ContentEditingSession";
import { reviewPolicy } from "@/features/geo/review-policy";
import { ReviewAssignment } from "@/components/forms/ReviewAssignment";
import {
  QuestionGuide,
  QuestionOverview,
} from "@/components/content/QuestionOverview";
import { SafeMarkdown, safeHref } from "@/components/content/SafeMarkdown";
import { faqPath } from "@/features/geo/public-faq";
import { articlePath } from "@/features/geo/config";
import { ArticleGenerationCheck } from "@/components/forms/GenerationWorkspace";
import { checkGeneratedArticle } from "@/features/generation/article-check";
import Link from "next/link";
import { notFound } from "next/navigation";
import { pageActor } from "@/lib/auth/page";
import { can } from "@/lib/auth/permissions";
import { db } from "@/lib/db";
import { kindOf, contentItem } from "@/features/geo/service";
import { HttpError } from "@/lib/http";
import {
  ContentEditor,
  WorkflowForm,
  type EditorData,
} from "@/components/forms/GeoForms";
import { reviewDecisions, type contentStatuses } from "@/features/geo/config";
export const metadata = { title: "编辑与审核内容" };
type Detail = EditorData & {
  id: string;
  status: keyof typeof contentStatuses;
  revision: number;
  isLive: boolean;
  editorId?: string;
  authorId?: string;
  submittedById?: string | null;
  submittedAt?: Date | null;
  author?: { name: string };
  editor?: { name: string };
  versions?: { revision: number }[];
  relatedFrom?: { toId: string }[];
  reviews?: {
    id: string;
    decision: string;
    revision: number;
    note: string;
    checklist?: {
      riskAssessment?: {
        confirmedLevel: string;
        basis: string;
        evidence: { claim: string; title?: string; type: string }[];
      };
    };
    createdAt: Date;
    reviewer: { name: string };
  }[];
};
export default async function GeoDetail({
  params,
}: {
  params: Promise<{ kind: string; id: string }>;
}) {
  const actor = await pageActor("content.read"),
    p = await params,
    kind = kindOf(p.kind);
  const item = (await contentItem(kind, p.id).catch((e) => {
    if (e instanceof HttpError && e.status === 404) notFound();
    throw e;
  })) as unknown as Detail;
  const articles = await db().article.findMany({
      select: { id: true, title: true },
      orderBy: { title: "asc" },
    }),
    editable = {
      ...item,
      relatedIds: item.relatedFrom?.map((r) => r.toId),
      hasPublicAnswer:
        kind === "questions"
          ? !!(await db().articleQuestionRelation.findFirst({
              where: { questionId: item.id, article: { isLive: true } },
            }))
          : false,
    };
  const policy =
    kind !== "questions" && item.status === "IN_REVIEW"
      ? await reviewPolicy(db(), kind, item.id, actor)
      : null;
  const risk =
    kind === "faqs"
      ? classifyFaq(item.question || "", item.answer || "")
      : null;
  const evidenceCatalog =
    kind === "faqs" || (kind === "articles" && item.generationMetadata)
      ? await db().articleSource.findMany({
          where: {
            articleId: null,
            sourceType: "INTERNAL_BANK",
            isActive: true,
          },
          select: {
            id: true,
            title: true,
            sourceUrl: true,
            excerpt: true,
            updatedAt: true,
            verifiedAt: true,
            validUntil: true,
          },
          orderBy: { title: "asc" },
          take: 100,
        })
      : [];
  const selfReview = policy?.selfReview || false;
  const rejected =
    item.status === "DRAFT" &&
    item.reviews?.[0]?.decision === "REJECTED" &&
    item.reviews[0].revision === item.revision - 1;
  const generated =
    kind === "articles"
      ? {
          id: item.id,
          title: item.title,
          authorId: item.authorId,
          editorId: item.editorId,
          submittedById: item.submittedById,
          content: item.content || "",
          tags: item.tags || [],
          sources: item.sources || [],
          generationMetadata: item.generationMetadata,
          revision: item.revision,
        }
      : null;
  const findings = generated?.generationMetadata
    ? await db().$transaction((tx) =>
        checkGeneratedArticle(tx, generated, false),
      )
    : [];
  return (
    <ContentEditingSession key={item.id} revision={item.revision}>
      <Link href={`/admin/geo/${kind}/`}>← 返回列表</Link>
      <h1>
        {kind === "articles"
          ? "文章编辑"
          : kind === "faqs"
            ? "常见问答编辑"
            : "融资问题编辑"}
      </h1>
      {kind === "questions" && (
        <>
          <QuestionGuide />
          {can(actor, "generation.create") && item.status !== "ARCHIVED" && (
            <p>
              <Link href={"/admin/geo/generation/?questionId=" + item.id}>
                生成文章
              </Link>
            </p>
          )}
          <QuestionOverview
            id={item.id}
            canCreate={
              can(actor, "content.create") && item.status !== "ARCHIVED"
            }
          />
        </>
      )}
      {policy && kind !== "questions" && (
        <details open={kind !== "faqs"}>
          <summary>审核分配与资格（需要时展开）</summary>
          <ReviewAssignment
            key={`${item.id}-${item.revision}-${policy.assigneeId}`}
            kind={kind}
            id={item.id}
            revision={item.revision}
            policy={policy}
            canAssign={can(actor, "content.assign_review")}
          />
        </details>
      )}
      {rejected && (
        <aside className="admin-panel">
          <h2>已驳回：请修改后重新提交</h2>
          <p>{item.reviews?.[0]?.note}</p>
        </aside>
      )}
      {kind !== "questions" && item.status === "IN_REVIEW" && (
        <section className="admin-panel">
          <h2>待审核的完整内容 · 版本{item.revision}</h2>
          <p>编辑锁定期间可核对以下全文、引用与历史记录，不必撤回才能阅读。</p>
          {kind === "faqs" && <h3>{item.question}</h3>}
          <SafeMarkdown
            content={kind === "faqs" ? item.answer || "" : item.content || ""}
          />
          <details open={kind !== "faqs"}>
            <summary>
              已有引用来源与适用时间（{item.sources?.length || 0}条）
            </summary>
            {!item.sources?.length && (
              <p>
                {risk
                  ? risk.reason
                  : "尚未填写已核验来源，不能审核通过。请由作者撤回审核、补充真实来源并保存后重新提交。"}
              </p>
            )}
            <ul>
              {item.sources?.map((source, i) => (
                <li key={i}>
                  {safeHref(source.url) ? (
                    <a href={source.url} rel="noreferrer">
                      {source.title}
                    </a>
                  ) : (
                    source.title
                  )}{" "}
                  · 核验：{source.checkedAt || "未记录"}{" "}
                  {source.validUntil && " · 截止：" + source.validUntil}
                </li>
              ))}
            </ul>
          </details>
          <p>
            请核对事实、适用时间、宣传承诺、客户隐私和还款风险；规则提示不代替人工审核。
          </p>
        </section>
      )}
      {!!generated?.generationMetadata && (
        <ArticleGenerationCheck
          articleId={item.id}
          revision={item.revision}
          metadata={
            generated.generationMetadata as {
              model?: string;
              templateVersion?: number;
              verificationItems?: string[];
              knowledgeWarnings?: string[];
            }
          }
          findings={findings}
        />
      )}
      {item.importMetadata && (
        <aside className="admin-panel">
          <h2>导入信息</h2>
          <p>
            原文编号：{item.importMetadata.recordLabel || "未提供"}
            （仅用于定位）
          </p>
          <p>来源：{item.importMetadata.source || "未提供"}</p>
          <p>
            导入时间：
            {item.importMetadata.importedAt
              ? new Date(item.importMetadata.importedAt).toLocaleString(
                  "zh-CN",
                  { timeZone: "Asia/Shanghai" },
                )
              : "未记录"}
          </p>
        </aside>
      )}
      {kind !== "questions" && (
        <p>
          作者：{item.author?.name || "历史内容未记录"} · 最后编辑：
          {item.editor?.name || "历史迁移"}
        </p>
      )}
      {can(actor, "content.update") &&
        kind !== "questions" &&
        item.status !== "IN_REVIEW" && (
          <p>
            <a className="button outline" href="#content-sources">
              前往引用来源填写区 ↓
            </a>
          </p>
        )}
      {can(actor, "content.update") && item.status !== "IN_REVIEW" ? (
        <ContentEditor
          key={`${item.id}-${item.revision}-${item.status}`}
          kind={kind}
          item={editable}
          articles={articles}
        />
      ) : (
        <p>
          {item.status === "IN_REVIEW"
            ? "当前版本正在审核，编辑已锁定。"
            : "当前账号没有编辑权限，请联系超级管理员。"}
          <Link href={`/admin/geo/${kind}/${item.id}/preview/`}>
            预览已保存内容
          </Link>
        </p>
      )}
      {kind !== "questions" && (
        <>
          <WorkflowForm
            key={`flow-${item.revision}-${item.status}-${item.isLive}`}
            kind={kind}
            id={item.id}
            revision={item.revision}
            status={item.status}
            isLive={item.isLive}
            canUpdate={can(actor, "content.update")}
            canReview={!!policy?.canReview}
            hasReviewPermission={can(actor, "content.review")}
            selfReview={selfReview}
            reviewReason={policy?.reason}
            approvalBlocked={!!policy?.missingItems.length}
            approvalIssues={policy?.missingItems}
            faqRisk={
              kind === "faqs" ||
              (kind === "articles" && item.generationMetadata)
                ? {
                    question:
                      kind === "faqs" ? item.question || "" : item.title || "",
                    answer:
                      kind === "faqs" ? item.answer || "" : item.content || "",
                    sources: item.sources || [],
                    catalog: evidenceCatalog.map((e) => ({
                      ...e,
                      updatedAt: e.updatedAt.toISOString(),
                      verifiedAt: e.verifiedAt?.toISOString() || null,
                      validUntil: e.validUntil?.toISOString() || null,
                    })),
                  }
                : undefined
            }
            canWithdraw={
              can(actor, "content.update") &&
              ([item.authorId, item.editorId, item.submittedById].includes(
                actor.id,
              ) ||
                can(actor, "content.review"))
            }
            canUnpublish={can(actor, "content.unpublish")}
            rejected={!!rejected}
            publicUrl={
              kind === "faqs"
                ? faqPath(item.id)
                : item.slug
                  ? articlePath(item.slug)
                  : undefined
            }
            canPublish={can(actor, "content.publish")}
            versions={
              kind === "articles" ? item.versions?.map((v) => v.revision) : []
            }
          />
          <h2>修改记录</h2>
          <ul>
            {item.versions?.map((v) => (
              <li key={v.revision}>
                <Link
                  href={`/admin/geo/${kind}/${item.id}/preview/?version=${v.revision}`}
                >
                  查看版本 {v.revision} 的完整快照
                </Link>
              </li>
            ))}
          </ul>
          <p>
            问答快照自本次修复起保留；原导入问答仅捕获迁移时当前内容，不补造更早历史。
          </p>
          <h2>审核记录</h2>
          {item.reviews?.map((r) => (
            <div className="admin-panel" key={r.id}>
              <p>
                版本 {r.revision} · {r.reviewer.name} ·{" "}
                {reviewDecisions[r.decision] || "待确认"}
              </p>
              <p>
                审核时间：
                {r.createdAt.toLocaleString("zh-CN", {
                  timeZone: "Asia/Shanghai",
                })}
              </p>
              <p>{r.note}</p>
              {r.checklist?.riskAssessment && (
                <details>
                  <summary>本版本风险与证据核验记录</summary>
                  <p>
                    确认风险等级：
                    {
                      (
                        {
                          LOW: "基础知识",
                          MEDIUM: "融资实操",
                          HIGH: "高风险内容",
                        } as Record<string, string>
                      )[r.checklist.riskAssessment.confirmedLevel]
                    }
                  </p>
                  <p>{r.checklist.riskAssessment.basis}</p>
                  {r.checklist.riskAssessment.evidence.map((e, i) => (
                    <p key={i}>
                      {e.claim} ·{" "}
                      {e.type === "INTERNAL_BANK" ? "受控内部资料" : "公开来源"}{" "}
                      {e.title || ""}
                    </p>
                  ))}
                </details>
              )}
            </div>
          ))}
        </>
      )}
    </ContentEditingSession>
  );
}
