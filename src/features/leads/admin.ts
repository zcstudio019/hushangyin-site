import type { Prisma } from "@prisma/client";
import type { Actor } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { HttpError } from "@/lib/http";
import { leadStatuses } from "@/lib/validations/consultation";
import { can, canReadLeads } from "@/lib/auth/permissions";
import { deny } from "@/lib/auth/authorization";
async function scopeError(
  actor: Actor,
  id: string,
  error: unknown,
): Promise<never> {
  if (error instanceof HttpError && error.status === 404)
    await db().auditLog.create({
      data: {
        actorId: actor.id,
        action: "PERMISSION_DENIED",
        resourceType: "lead",
        resourceId: id.slice(0, 64),
      },
    });
  throw error;
}
export function scope(actor: Actor): Prisma.LeadWhereInput {
  if (actor.mustChangePassword) return { id: { in: [] } };
  if (actor.role === "SUPER_ADMIN") return {};
  if (actor.role === "SALES_MANAGER" && actor.departmentId)
    return {
      departmentId: actor.departmentId,
      department: { isActive: true },
      assignedTo: { not: null },
    };
  if (actor.role === "FINANCING_ADVISOR") return { assignedTo: actor.id };
  return { id: { in: [] } };
}
export async function listLeads(actor: Actor, page = 1) {
  if (!canReadLeads(actor)) await deny(actor, "lead");
  const take = 25,
    skip = (page - 1) * take;
  return db().$transaction(async (tx) => {
    const [items, total] = await Promise.all([
      tx.lead.findMany({
        where: scope(actor),
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take,
        skip,
        select: {
          id: true,
          name: true,
          phone: true,
          customerType: true,
          status: true,
          createdAt: true,
        },
      }),
      tx.lead.count({ where: scope(actor) }),
    ]);
    await tx.auditLog.create({
      data: {
        actorId: actor.id,
        action: "LIST",
        resourceType: "lead",
        metadata: { page },
      },
    });
    return {
      items: items.map((item) => ({
        ...item,
        phone: item.phone.slice(0, 3) + "****" + item.phone.slice(-4),
      })),
      total,
      page,
    };
  });
}
export async function leadDetail(actor: Actor, id: string) {
  if (!canReadLeads(actor)) await deny(actor, "lead", id);
  return db()
    .$transaction(async (tx) => {
      const lead = await tx.lead.findFirst({
        where: { id, ...scope(actor) },
        include: {
          attribution: {select:{sourceType:true,articleId:true,faqId:true,contentTitle:true,path:true,channel:true,confidence:true,utmSource:true,utmMedium:true,utmCampaign:true,createdAt:true,article:{select:{isLive:true}},faq:{select:{isLive:true}}}},
          assignee: { select: { id: true, name: true, isActive: true } },
          department: { select: { name: true } },
          consents: {
            select: { consentType: true, policyVersion: true, agreedAt: true },
          },
        },
      });
      if (!lead)
        throw new HttpError(404, "NOT_FOUND", "线索不存在或无权访问。");
      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          action: "READ",
          resourceType: "lead",
          resourceId: id,
        },
      });
      return lead;
    })
    .catch((error) => scopeError(actor, id, error));
}
export async function changeStatus(
  actor: Actor,
  id: string,
  status: (typeof leadStatuses)[number],
) {
  if (
    !can(actor, "leads.update_all") &&
    !can(actor, "leads.update_department") &&
    !can(actor, "leads.update_assigned")
  )
    await deny(actor, "lead", id);
  return db()
    .$transaction(async (tx) => {
      const result = await tx.lead.updateMany({
        where: { id, ...scope(actor) },
        data: { status },
      });
      if (!result.count)
        throw new HttpError(404, "NOT_FOUND", "线索不存在或无权访问。");
      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          action: "STATUS_CHANGE",
          resourceType: "lead",
          resourceId: id,
          metadata: { status },
        },
      });
      return { id, status };
    })
    .catch((error) => scopeError(actor, id, error));
}
