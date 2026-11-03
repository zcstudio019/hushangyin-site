import "server-only";
import { requireAdmin, type Actor } from "./session";
import { can, type Permission } from "./permissions";
import { db } from "@/lib/db";
import { HttpError } from "@/lib/http";
import { limit } from "@/lib/security";
import { verify } from "@node-rs/argon2";
export async function deny(
  actor: Actor,
  resourceType: string,
  resourceId?: string,
): Promise<never> {
  await db().auditLog.create({
    data: {
      actorId: actor.id,
      action: "PERMISSION_DENIED",
      resourceType,
      resourceId,
    },
  });
  throw new HttpError(403, "FORBIDDEN", "您无权执行此操作。");
}
export async function authorize(actor: Actor, permission: Permission) {
  if (!can(actor, permission)) await deny(actor, "permission", permission);
}
export async function requirePermission(permission: Permission) {
  const actor = await requireAdmin();
  await authorize(actor, permission);
  return actor;
}
export async function reauthenticate(actor: Actor, password: string) {
  await limit("reauth:" + actor.id, 30);
  const user = await db().adminUser.findUniqueOrThrow({
    where: { id: actor.id },
  });
  if (
    !user.isActive ||
    user.sessionVersion !== actor.sessionVersion ||
    !(await verify(user.passwordHash, password).catch(() => false))
  )
    throw new HttpError(401, "REAUTH_FAILED", "当前密码验证失败，请重试。");
}
