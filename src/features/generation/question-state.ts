import { Prisma, type QuestionStatus } from "@prisma/client";
export async function questionStatus(
  tx: Prisma.TransactionClient,
  id: string,
  status: QuestionStatus,
  actorId?: string,
  reason = "manual",
) {
  const old = await tx.geoQuestion.findUniqueOrThrow({ where: { id } });
  if (old.status === status) return;
  await tx.geoQuestion.update({ where: { id }, data: { status } });
  await tx.auditLog.create({
    data: {
      actorId,
      action: "QUESTION_STATUS_CHANGE",
      resourceType: "geo_questions",
      resourceId: id,
      metadata: { from: old.status, to: status, reason },
    },
  });
}
export async function recalculateQuestion(
  tx: Prisma.TransactionClient,
  id: string,
  actorId?: string,
) {
  const q = await tx.geoQuestion.findUnique({ where: { id } });
  if (!q || q.status === "ARCHIVED") return;
  const links = await tx.articleQuestionRelation.findMany({
    where: { questionId: id },
    include: {
      article: { select: { id: true, isLive: true, publishedSnapshot: true } },
    },
    orderBy: { createdAt: "asc" },
  });
  const live = links.find(
    (l) => l.article.isLive && l.article.publishedSnapshot,
  );
  const status = live
    ? "ANSWERED"
    : links.length
      ? "PLANNED"
      : q.status === "ANSWERED"
        ? "OPEN"
        : q.status;
  await questionStatus(tx, id, status, actorId, "public-answer-recalculation");
  const primary = live?.articleId || q.articleId || links[0]?.articleId;
  if (primary && q.articleId !== primary)
    await tx.geoQuestion.update({
      where: { id },
      data: { articleId: primary },
    });
}
export async function recalculateQuestions(
  tx: Prisma.TransactionClient,
  articleId: string,
  actorId?: string,
) {
  const links = await tx.articleQuestionRelation.findMany({
    where: { articleId },
    select: { questionId: true },
  });
  for (const l of links) await recalculateQuestion(tx, l.questionId, actorId);
}
