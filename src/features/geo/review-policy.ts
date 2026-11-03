import { classifyFaq } from "./risk";
import { factApproval } from "@/features/generation/article-evidence";
import "server-only";
import type { Prisma, PrismaClient, AdminRole } from "@prisma/client";
import type { Actor } from "@/lib/auth/session";
import { can, roleNames } from "@/lib/auth/permissions";
import { HttpError } from "@/lib/http";
import { sourceSchema } from "./validation";
type Client = Prisma.TransactionClient | PrismaClient;
export type ReviewKind = "articles" | "faqs";
export type ReviewAccount = {
  id: string;
  name: string;
  role: AdminRole;
  isActive: boolean;
  mustChangePassword: boolean;
  initialCredentialExpiresAt: Date | null;
  department: { name: string; isActive: boolean } | null;
};
export function accountReviewReasons(
  account: ReviewAccount,
  participants: readonly string[] = [],
) {
  const reasons: string[] = [];
  if (!can(account, "content.review")) reasons.push("无内容审核权限");
  if (!account.isActive) reasons.push("账号已停用");
  if (account.mustChangePassword)
    reasons.push(
      account.initialCredentialExpiresAt &&
        account.initialCredentialExpiresAt < new Date()
        ? "账号未激活：首次改密未完成且初始凭据已过期"
        : "账号未激活：尚未完成首次改密",
    );
  if (participants.includes(account.id)) reasons.push("参与当前版本，不能自审");
  return reasons;
}
export async function reviewAccountPool(client: Client) {
  return client.adminUser.findMany({
    select: {
      id: true,
      name: true,
      role: true,
      isActive: true,
      mustChangePassword: true,
      initialCredentialExpiresAt: true,
      department: { select: { name: true, isActive: true } },
    },
    orderBy: { name: "asc" },
  });
}
export const reviewDepartment = (account: ReviewAccount) =>
  account.department
    ? account.department.name +
      (account.department.isActive ? "" : "（已停用）")
    : "未分配部门";
export async function auditReviewInvalidation(
  tx: Prisma.TransactionClient,
  actor: Actor,
  kind: ReviewKind,
  id: string,
  previous: {
    reviewAssigneeId: string | null;
    reviewAssignedRevision: number | null;
  },
) {
  if (previous.reviewAssigneeId)
    await tx.auditLog.create({
      data: {
        actorId: actor.id,
        action: "CONTENT_REVIEW_ASSIGNMENT_INVALIDATED",
        resourceType: "geo_" + kind,
        resourceId: id,
        metadata: {
          assigneeId: previous.reviewAssigneeId,
          revision: previous.reviewAssignedRevision,
          reason: "new_version",
        },
      },
    });
}
export async function reviewerPool(client: Client) {
  return (await reviewAccountPool(client)).filter(
    (u) => accountReviewReasons(u).length === 0,
  );
}
export function sourceGaps(input: unknown) {
  if (!Array.isArray(input) || !input.length)
    return ["未填写引用来源，请由作者补充来源标题、HTTPS网址和实际核验日期。"];
  const today = new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10),
    gaps: string[] = [];
  input.forEach((s, i) => {
    const v = sourceSchema.safeParse(s);
    if (!v.success)
      gaps.push(
        `第${i + 1}条引用格式不完整，请核对标题、HTTPS网址、核验日期和适用截止日期。`,
      );
    else {
      if (v.data.checkedAt > today)
        gaps.push(`第${i + 1}条引用的核验日期晚于今天。`);
      if (v.data.validUntil && v.data.validUntil < today)
        gaps.push(`第${i + 1}条引用已超过适用截止日期。`);
    }
  });
  return gaps;
}
export async function reviewPolicy(
  client: Client,
  kind: ReviewKind,
  id: string,
  actor: Actor,
  pool?: ReviewAccount[],
) {
  const item =
    kind === "articles"
      ? await client.article.findUnique({ where: { id } })
      : await client.faq.findUnique({ where: { id } });
  if (!item) throw new HttpError(404, "NOT_FOUND", "内容不存在。");
  const version =
    kind === "articles"
      ? await client.articleVersion.findUnique({
          where: {
            articleId_revision: { articleId: id, revision: item.revision },
          },
          select: { editorId: true },
        })
      : await client.faqVersion.findUnique({
          where: { faqId_revision: { faqId: id, revision: item.revision } },
          select: { editorId: true },
        });
  const submissions = await client.auditLog.findMany({
    where: {
      resourceType: "geo_" + kind,
      resourceId: id,
      action: "CONTENT_SUBMIT",
      metadata: { path: ["revision"], equals: item.revision },
    },
    select: { actorId: true },
    take: 100,
  });
  const importer =
    kind === "faqs"
      ? ((item as { importMetadata: unknown }).importMetadata as {
          importedBy?: string;
        } | null)
      : null;
  const participants = [
    ...new Set(
      [
        item.authorId,
        item.editorId,
        item.submittedById,
        version?.editorId,
        importer?.importedBy,
        ...submissions.map((s) => s.actorId),
      ].filter((v): v is string => typeof v === "string" && !!v),
    ),
  ];
  const accounts = pool || (await reviewAccountPool(client));
  const reviewers = accounts.filter(
    (u) => accountReviewReasons(u).length === 0,
  );
  const candidates = accounts.filter(
    (u) => accountReviewReasons(u, participants).length === 0,
  );
  const excludedAccounts = can(actor, "content.assign_review")
    ? accounts
        .map((u) => ({
          id: u.id,
          name: u.name,
          roleName: roleNames[u.role],
          departmentName: reviewDepartment(u),
          reasons: accountReviewReasons(u, participants),
        }))
        .filter((u) => u.reasons.length)
    : [];
  const assigned = item.reviewAssigneeId
    ? reviewers.find((u) => u.id === item.reviewAssigneeId)
    : undefined;
  const assignmentValid =
    !!assigned &&
    item.reviewAssignedRevision === item.revision &&
    !participants.includes(assigned.id);
  const selfReview = participants.includes(actor.id);
  const articleItem =
    kind === "articles" ? (item as Prisma.ArticleGetPayload<object>) : null;
  const articleSourceGaps =
    articleItem?.generationMetadata &&
    ((classifyFaq(articleItem.title, articleItem.content).claims.length === 0 &&
      classifyFaq(articleItem.title, articleItem.content).level !== "HIGH") ||
      (await factApproval(client, articleItem)))
      ? []
      : sourceGaps(item.sources);
  let reason = "";
  if (!can(actor, "content.review"))
    reason = "当前账号没有审核权限，请联系超级管理员。";
  else if (selfReview)
    reason =
      "此版本由你参与创作、编辑、导入或提交，不能自审。请分配另一位有权限的独立审核人员。";
  else if (item.reviewAssigneeId && !assignmentValid)
    reason =
      "已分配的审核人已失效、参与了本版本或分配版本不一致，请超级管理员重新分配。";
  else if (assigned && assigned.id !== actor.id)
    reason =
      "当前版本已分配给另一位审核人员。请由其审核，或由超级管理员正式重新分配。";
  return {
    currentActor: {
      id: actor.id,
      roleName: roleNames[actor.role],
      canReview: can(actor, "content.review"),
      canPublish: can(actor, "content.publish"),
    },
    participantOrigins: {
      authorId: item.authorId,
      editorId: item.editorId,
      submittedById: item.submittedById,
      importedById: importer?.importedBy || null,
      versionEditorId: version?.editorId || null,
    },
    revision: item.revision,
    status: item.status,
    participants,
    selfReview,
    canReview: !reason,
    reason,
    candidates: can(actor, "content.assign_review")
      ? candidates.map((u) => ({
          id: u.id,
          name: u.name,
          role: u.role,
          roleName: roleNames[u.role],
          departmentName: reviewDepartment(u),
        }))
      : [],
    excludedAccounts,
    missingItems: [
      ...(kind === "faqs" && !(item as { answer: string }).answer.trim()
        ? ["FAQ答案为空，须由作者补充实际答案后重新提交。"]
        : []),
      ...(kind === "faqs"
        ? classifyFaq(
            (item as { question: string }).question,
            (item as { answer: string }).answer,
          ).blockers
        : articleSourceGaps),
    ],
    qualifiedCount: candidates.length,
    reviewerCount: reviewers.length,
    assigneeId: item.reviewAssigneeId,
    assigneeName: assigned?.name || null,
    assignmentValid,
    assignedRevision: item.reviewAssignedRevision,
    missingSources: kind === "faqs" ? [] : articleSourceGaps,
    risk:
      kind === "faqs"
        ? classifyFaq(
            (item as { question: string }).question,
            (item as { answer: string }).answer,
          )
        : null,
  };
}
