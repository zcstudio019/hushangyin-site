import { requirePermission } from "@/lib/auth/authorization";
import { success, failure } from "@/lib/http";
import { reviewQueue } from "@/features/geo/reviews";
export async function GET(r: Request) {
  try {
    const actor = await requirePermission("content.read");
    return success(
      await reviewQueue(Object.fromEntries(new URL(r.url).searchParams), actor),
    );
  } catch (e) {
    return failure(e);
  }
}
