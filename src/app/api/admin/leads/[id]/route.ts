import { requireAdmin } from "@/lib/auth/session";
import {
  success,
  failure,
  HttpError,
  assertOrigin,
  readJson,
} from "@/lib/http";
import { leadDetail, changeStatus } from "@/features/leads/admin";
import { statusSchema } from "@/lib/validations/consultation";
type Context = { params: Promise<{ id: string }> };
export async function GET(_request: Request, { params }: Context) {
  try {
    const actor = await requireAdmin();
    return success(await leadDetail(actor, (await params).id));
  } catch (error) {
    return failure(error);
  }
}
export async function PATCH(request: Request, { params }: Context) {
  try {
    const actor = await requireAdmin();
    assertOrigin(request);
    const parsed = statusSchema.safeParse(await readJson(request, 1024));
    if (!parsed.success)
      throw new HttpError(400, "VALIDATION_ERROR", "线索状态无效。");
    return success(
      await changeStatus(actor, (await params).id, parsed.data.status),
    );
  } catch (error) {
    return failure(error);
  }
}
