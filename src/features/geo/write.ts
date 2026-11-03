import "server-only";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { HttpError } from "@/lib/http";
import { authorize } from "@/lib/auth/authorization";
import { can, type Permission } from "@/lib/auth/permissions";
import type { Actor } from "@/lib/auth/session";
import { limit } from "@/lib/security";
import type { Kind } from "./service";
export async function geoWrite<T>(
  actor: Actor,
  permission: Permission,
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
) {
  await authorize(actor, permission);
  await limit("content-write:" + actor.id, 100);
  try {
    return await db().$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(151151)`;
        await tx.$queryRaw`SELECT id FROM admin_users WHERE id=${actor.id} FOR SHARE`;
        const fresh = await tx.adminUser.findUnique({
          where: { id: actor.id },
        });
        if (
          !fresh ||
          !fresh.isActive ||
          fresh.mustChangePassword ||
          fresh.sessionVersion !== actor.sessionVersion ||
          !can(fresh, permission)
        )
          throw new HttpError(
            401,
            "UNAUTHORIZED",
            "账号权限已变更，请重新登录。",
          );
        return fn(tx);
      },
      { timeout: 15000 },
    );
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")
      throw new HttpError(409, "DUPLICATE", "网址、问题或版本已存在。");
    throw e;
  }
}
export async function geoAudit(
  tx: Prisma.TransactionClient,
  actor: Actor,
  action: string,
  kind: Kind,
  id: string,
  metadata?: Prisma.InputJsonValue,
) {
  return tx.auditLog.create({
    data: {
      actorId: actor.id,
      action,
      resourceType: "geo_" + kind,
      resourceId: id,
      metadata,
    },
  });
}
