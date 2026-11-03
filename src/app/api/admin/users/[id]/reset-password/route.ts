import { requirePermission } from "@/lib/auth/authorization";
import { assertOrigin, readJson, success, failure } from "@/lib/http";
import { resetPassword } from "@/features/accounts/service";
export async function POST(
  r: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    assertOrigin(r);
    const a = await requirePermission("users.update");
    return success(
      await resetPassword(a, (await params).id, await readJson(r, 2048)),
    );
  } catch (e) {
    return failure(e);
  }
}
