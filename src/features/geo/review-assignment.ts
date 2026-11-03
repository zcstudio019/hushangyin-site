import "server-only";
import { z } from "zod";
import type { Actor } from "@/lib/auth/session";
import { geoWrite } from "./write";
import { reviewPolicy, type ReviewKind } from "./review-policy";
import { HttpError } from "@/lib/http";
import { parseGeo } from "./errors";
export const assignmentSchema = z
  .object({
    revision: z.number().int().min(0),
    assigneeId: z.string().min(1).max(64).nullable(),
  })
  .strict();
export async function assignReviewer(
  actor: Actor,
  kind: ReviewKind,
  id: string,
  input: unknown,
) {
  const v = parseGeo(assignmentSchema, input);
  return geoWrite(actor, "content.assign_review", async (tx) => {
    if (v.assigneeId)
      await tx.$queryRaw`SELECT id FROM admin_users WHERE id=${v.assigneeId} FOR SHARE`;
    const context = await reviewPolicy(tx, kind, id, actor);
    if (context.revision !== v.revision)
      throw new HttpError(
        409,
        "STALE_VERSION",
        "内容版本已变化，请刷新后重新分配。",
      );
    if (context.status !== "IN_REVIEW")
      throw new HttpError(
        409,
        "STATE_INVALID",
        "仅待审核的具体版本可以分配审核人。",
      );
    if (v.assigneeId && !context.candidates.some((u) => u.id === v.assigneeId))
      throw new HttpError(
        400,
        "REVIEWER_INVALID",
        "所选账号没有有效审核权限、尚未完成初始化，或参与了此版本，不能分配。",
      );
    const data = {
      reviewAssigneeId: v.assigneeId,
      reviewAssignedRevision: v.assigneeId ? v.revision : null,
      reviewAssignedAt: v.assigneeId ? new Date() : null,
    };
    if (kind === "articles") await tx.article.update({ where: { id }, data });
    else await tx.faq.update({ where: { id }, data });
    await tx.auditLog.create({
      data: {
        actorId: actor.id,
        action: "CONTENT_REVIEW_ASSIGN",
        resourceType: "geo_" + kind,
        resourceId: id,
        metadata: {
          revision: v.revision,
          previousAssigneeId: context.assigneeId,
          assigneeId: v.assigneeId,
        },
      },
    });
    return { ...data, revision: v.revision };
  });
}
