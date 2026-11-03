import { requireAdmin } from "@/lib/auth/session";
import { success, failure, HttpError } from "@/lib/http";
import { listLeads } from "@/features/leads/admin";
export async function GET(request: Request) {
  try {
    const actor = await requireAdmin();
    const page = Number(new URL(request.url).searchParams.get("page") || 1);
    if (!Number.isInteger(page) || page < 1 || page > 10000)
      throw new HttpError(400, "INVALID_PAGE", "页码无效。");
    return success(await listLeads(actor, page));
  } catch (error) {
    return failure(error);
  }
}
