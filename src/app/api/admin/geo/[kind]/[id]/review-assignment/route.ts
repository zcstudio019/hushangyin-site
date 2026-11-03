import { requirePermission } from "@/lib/auth/authorization";
import {
  assertOrigin,
  readJson,
  success,
  failure,
  HttpError,
} from "@/lib/http";
import { assignReviewer } from "@/features/geo/review-assignment";
export async function POST(
  r: Request,
  { params }: { params: Promise<{ kind: string; id: string }> },
) {
  try {
    assertOrigin(r);
    const actor = await requirePermission("content.assign_review"),
      p = await params;
    if (!["articles", "faqs"].includes(p.kind))
      throw new HttpError(404, "NOT_FOUND", "内容类型不存在。");
    return success(
      await assignReviewer(
        actor,
        p.kind as "articles" | "faqs",
        p.id,
        await readJson(r, 4096),
      ),
    );
  } catch (e) {
    return failure(e);
  }
}
