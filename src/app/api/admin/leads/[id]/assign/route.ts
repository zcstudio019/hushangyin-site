import { requirePermission } from "@/lib/auth/authorization";
import { assertOrigin, readJson, success, failure } from "@/lib/http";
import { assignLead } from "@/features/accounts/service";
export async function PATCH(
  r: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    assertOrigin(r);
    const a = await requirePermission("leads.assign_department");
    return success(
      await assignLead(a, (await params).id, await readJson(r, 2048)),
    );
  } catch (e) {
    return failure(e);
  }
}
