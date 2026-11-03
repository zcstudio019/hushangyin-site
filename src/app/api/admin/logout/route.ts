import { assertOrigin, success, failure } from "@/lib/http";
import { requireAdmin, sessionCookie } from "@/lib/auth/session";
import { db } from "@/lib/db";
export async function POST(request: Request) {
  try {
    const actor = await requireAdmin(true);
    assertOrigin(request);
    const cookie = await sessionCookie();
    await db().$transaction([
      db().adminSession.delete({ where: { id: actor.sessionId } }),
      db().auditLog.create({
        data: {
          actorId: actor.id,
          action: "LOGOUT",
          resourceType: "admin_user",
          resourceId: actor.id,
        },
      }),
    ]);
    cookie.destroy();
    return success({ redirect: "/admin/login/" });
  } catch (error) {
    return failure(error);
  }
}
