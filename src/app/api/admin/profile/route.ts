import { requireAdmin, sessionCookie } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { assertOrigin, readJson, success, failure } from "@/lib/http";
import { changePassword, publicUserSelect } from "@/features/accounts/service";
export async function GET() {
  try {
    const a = await requireAdmin(true);
    return success(
      await db().adminUser.findUnique({
        where: { id: a.id },
        select: publicUserSelect,
      }),
    );
  } catch (e) {
    return failure(e);
  }
}
export async function PATCH(r: Request) {
  try {
    assertOrigin(r);
    const a = await requireAdmin(true);
    const result = await changePassword(a, await readJson(r, 2048));
    (await sessionCookie()).destroy();
    return success(result);
  } catch (e) {
    return failure(e);
  }
}
