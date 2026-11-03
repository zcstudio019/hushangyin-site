import { z } from "zod";
import { requirePermission } from "@/lib/auth/authorization";
import { can } from "@/lib/auth/permissions";
import {
  assertOrigin,
  readJson,
  success,
  failure,
  HttpError,
} from "@/lib/http";
import { db } from "@/lib/db";
import { parseGeo } from "@/features/geo/errors";
import { assignReviewer } from "@/features/geo/review-assignment";
import { workflow } from "@/features/geo/service";
import { reviewAccountPool, reviewPolicy } from "@/features/geo/review-policy";
import { classifyFaq } from "@/features/geo/risk";
const row = z
  .object({
    id: z.string().min(1).max(64),
    revision: z.number().int().min(0),
    basis: z.string().trim().min(10).max(1000).optional(),
    confirmed: z.boolean().optional(),
  })
  .strict();
const schema = z
  .object({
    action: z.enum(["assign", "approve"]),
    assigneeId: z.string().min(1).max(64).optional(),
    items: z.array(row).min(1).max(100),
  })
  .strict()
  .refine(
    (v) => new Set(v.items.map((i) => i.id)).size === v.items.length,
    "批次包含重复内容，请刷新后重试。",
  );
export async function GET() {
  try {
    const actor = await requirePermission("content.read"),
      pool = await reviewAccountPool(db());
    const rows = await db().faq.findMany({
      where: { status: "IN_REVIEW" },
      orderBy: { updatedAt: "desc" },
      take: 100,
    });
    return success(
      await Promise.all(
        rows.map(async (f) => ({
          id: f.id,
          question: f.question,
          answer: f.answer,
          revision: f.revision,
          risk: classifyFaq(f.question, f.answer),
          policy: await reviewPolicy(db(), "faqs", f.id, actor, pool),
        })),
      ),
    );
  } catch (e) {
    return failure(e);
  }
}
export async function POST(r: Request) {
  try {
    assertOrigin(r);
    const actor = await requirePermission("content.read"),
      v = parseGeo(schema, await readJson(r, 360000));
    if (
      !can(
        actor,
        v.action === "assign" ? "content.assign_review" : "content.review",
      )
    )
      throw new HttpError(403, "FORBIDDEN", "当前账号没有该批量操作权限。");
    const results: { id: string; ok: boolean; message: string }[] = [];
    for (const item of v.items) {
      try {
        if (v.action === "assign") {
          if (!v.assigneeId)
            throw new HttpError(400, "REVIEWER_REQUIRED", "请选择独立审核人。");
          await assignReviewer(actor, "faqs", item.id, {
            revision: item.revision,
            assigneeId: v.assigneeId,
          });
        } else {
          const faq = await db().faq.findUnique({ where: { id: item.id } });
          if (!faq || classifyFaq(faq.question, faq.answer).level !== "LOW")
            throw new HttpError(
              400,
              "LOW_ONLY",
              "批量审核只处理基础知识；中高风险须进入单条内容逐项核验。",
            );
          if (!item.confirmed || !item.basis)
            throw new HttpError(
              400,
              "PER_ITEM_REVIEW",
              "此条缺少独立人工核验确认或至少10字判断依据。",
            );
          await workflow(actor, "faqs", item.id, {
            action: "approve",
            revision: item.revision,
            note: item.basis,
            risk: {
              level: "LOW",
              confirmed: true,
              basis: item.basis,
              evidence: [],
            },
          });
        }
        results.push({
          id: item.id,
          ok: true,
          message:
            v.action === "assign" ? "分配成功" : "已审核，仍需单独授权发布",
        });
      } catch (e) {
        results.push({
          id: item.id,
          ok: false,
          message:
            e instanceof HttpError
              ? e.message
              : "服务暂不可用，此条结果未确认，请刷新核对。",
        });
      }
    }
    return success({
      results,
      succeeded: results.filter((i) => i.ok).length,
      failed: results.filter((i) => !i.ok).length,
    });
  } catch (e) {
    return failure(e);
  }
}
