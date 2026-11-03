import "server-only";
import { redirect } from "next/navigation";
import { currentAdmin } from "./session";
import { can, type Permission } from "./permissions";
import { db } from "@/lib/db";
// Keep Next page navigation out of API and database service modules.
export async function pageActor(permission?: Permission) {
  const actor = await currentAdmin();
  if (!actor) redirect("/admin/login/");
  if (actor.mustChangePassword)
    redirect("/admin/settings/profile/?change=required");
  if (permission && !can(actor, permission)) {
    await db().auditLog.create({
      data: {
        actorId: actor.id,
        action: "PERMISSION_DENIED",
        resourceType: "page",
        resourceId: permission,
      },
    });
    redirect("/admin/settings/profile/?denied=1");
  }
  return actor;
}
