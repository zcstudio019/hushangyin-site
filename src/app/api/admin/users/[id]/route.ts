import { requirePermission } from "@/lib/auth/authorization";
import { assertOrigin, readJson, success, failure } from "@/lib/http";
import { saveUser } from "@/features/accounts/service";
export async function PATCH(
  r: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    assertOrigin(r);
    const a = await requirePermission("users.update");
    return success(
      await saveUser(a, await readJson(r, 4096), (await params).id),
    );
  } catch (e) {
    return failure(e);
  }
}
