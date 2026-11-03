import { containsSensitive } from "@/features/generation/validation";
import { requirePermission, reauthenticate } from "@/lib/auth/authorization";
import {
  assertOrigin,
  readJson,
  success,
  failure,
  HttpError,
} from "@/lib/http";
import { db } from "@/lib/db";
import { geoWrite } from "@/features/geo/write";
import { parseGeo } from "@/features/geo/errors";
import { internalEvidenceSchema } from "@/features/geo/risk-evidence";
export async function GET() {
  try {
    await requirePermission("content.read");
    return success(
      await db().articleSource.findMany({
        where: { articleId: null, sourceType: "INTERNAL_BANK" },
        select: {
          id: true,
          title: true,
          sourceUrl: true,
          excerpt: true,
          updatedAt: true,
          verifiedAt: true,
          validUntil: true,
          isActive: true,
        },
        orderBy: { updatedAt: "desc" },
        take: 100,
      }),
    );
  } catch (e) {
    return failure(e);
  }
}
export async function POST(r: Request) {
  try {
    assertOrigin(r);
    const actor = await requirePermission("content.assign_review"),
      v = parseGeo(internalEvidenceSchema, await readJson(r, 16000));
    await reauthenticate(actor, v.reauthPassword);
    if (containsSensitive(v.title + " " + v.reference + " " + v.excerpt))
      throw new HttpError(
        400,
        "SENSITIVE_EVIDENCE",
        "内部产品依据不得包含客户姓名、手机号、征信或其他个人敏感资料。",
      );
    const today = new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10);
    if (v.checkedAt > today || (v.validUntil && v.validUntil < v.checkedAt))
      throw new HttpError(
        400,
        "DATE_INVALID",
        "核验日期不能晚于今天，截止日期不能早于核验日期。",
      );
    return success(
      await geoWrite(actor, "content.assign_review", async (tx) => {
        if (
          v.id &&
          !(await tx.articleSource.findFirst({
            where: { id: v.id, articleId: null, sourceType: "INTERNAL_BANK" },
          }))
        )
          throw new HttpError(404, "NOT_FOUND", "内部资料未登记。");
        const duplicate = await tx.articleSource.findFirst({
          where: {
            articleId: null,
            sourceType: "INTERNAL_BANK",
            sourceUrl: "internal:" + v.reference,
          },
        });
        if (duplicate && duplicate.id !== v.id)
          throw new HttpError(
            409,
            "DUPLICATE_EVIDENCE",
            "该资料编号和版本已登记，请选择已有资料更新。",
          );
        const data = {
          title: v.title,
          sourceUrl: "internal:" + v.reference,
          excerpt: v.excerpt,
          verifiedAt: new Date(v.checkedAt),
          validUntil: v.validUntil ? new Date(v.validUntil) : null,
          isActive: v.isActive,
          verifiedById: actor.id,
          sourceType: "INTERNAL_BANK",
        };
        const saved = v.id
          ? await tx.articleSource.update({ where: { id: v.id }, data })
          : await tx.articleSource.create({ data });
        await tx.auditLog.create({
          data: {
            actorId: actor.id,
            action: v.id
              ? "INTERNAL_EVIDENCE_UPDATE"
              : "INTERNAL_EVIDENCE_CREATE",
            resourceType: "article_source",
            resourceId: saved.id,
            metadata: {
              isActive: saved.isActive,
              sourceType: saved.sourceType,
            },
          },
        });
        return { id: saved.id };
      }),
    );
  } catch (e) {
    return failure(e);
  }
}
