import { requirePermission } from "@/lib/auth/authorization";
import { assertOrigin, readJson, success, failure } from "@/lib/http";
import { saveDepartment } from "@/features/accounts/service";
export async function PATCH(
  r: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    assertOrigin(r);
    const a = await requirePermission("departments.manage");
    return success(
      await saveDepartment(a, await readJson(r, 2048), (await params).id),
    );
  } catch (e) {
    return failure(e);
  }
}
