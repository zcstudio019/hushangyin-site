import "server-only";
import { hash, verify } from "@node-rs/argon2";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import type { Actor } from "@/lib/auth/session";
import { authorize, reauthenticate } from "@/lib/auth/authorization";
import { HttpError } from "@/lib/http";
import { randomToken, limit } from "@/lib/security";
import { userSchema, changePasswordSchema } from "@/lib/validations/account";
import { siteUrl } from "@/config/site";
import { accountFieldNames } from "@/config/admin-labels";
export const publicUserSelect = {
  id: true,
  name: true,
  email: true,
  role: true,
  departmentId: true,
  isActive: true,
  mustChangePassword: true,
  lastLoginAt: true,
  createdAt: true,
  updatedAt: true,
  department: { select: { name: true } },
} satisfies Prisma.AdminUserSelect;
export function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const p = schema.safeParse(input);
  if (!p.success) {
    const issue = p.error.issues[0],
      field = accountFieldNames[String(issue.path[0])] || "填写内容";
    const message = /[\u4e00-\u9fff]/.test(issue.message)
      ? issue.message
      : issue.code === "unrecognized_keys"
        ? "存在不支持的字段，请使用页面提供的输入项。"
        : issue.code === "too_big"
          ? `${field}过长，请缩短后重试。`
          : issue.code === "too_small"
            ? `${field}不能为空或过短，请补充后重试。`
            : `${field}格式或选项不正确，请检查后重试。`;
    throw new HttpError(400, "VALIDATION_ERROR", message);
  }
  return p.data;
}
export const hashPassword = (value: string) =>
  hash(value, { memoryCost: 19456, timeCost: 2, parallelism: 1 });
function localCredentialDelivery() {
  if (
    process.env.LOCAL_TEST_MODE !== "true" ||
    !["127.0.0.1", "localhost"].includes(new URL(siteUrl()).hostname)
  )
    throw new HttpError(
      503,
      "DELIVERY_UNAVAILABLE",
      "尚未配置经批准的凭据交付渠道，当前仅支持本地测试初始化。",
    );
}
async function serial<T>(
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  try {
    return await db().$transaction(
      async (tx) => {
        // Serialize account/department/assignment changes and protect the last super admin.
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(103103)`;
        return fn(tx);
      },
      { timeout: 15000 },
    );
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")
      throw new HttpError(409, "DUPLICATE", "邮箱或部门名称已存在。");
    throw e;
  }
}
async function checkActor(tx: Prisma.TransactionClient, actor: Actor) {
  const u = await tx.adminUser.findUniqueOrThrow({ where: { id: actor.id } });
  if (
    !u.isActive ||
    u.sessionVersion !== actor.sessionVersion ||
    u.role !== actor.role
  )
    throw new HttpError(401, "UNAUTHORIZED", "账号权限已变更，请重新登录。");
}
async function department(
  tx: Prisma.TransactionClient,
  id: string | null,
  role?: string,
) {
  if ((role === "SALES_MANAGER" || role === "FINANCING_ADVISOR") && !id)
    throw new HttpError(
      400,
      "DEPARTMENT_REQUIRED",
      "主管和顾问必须指定有效部门。",
    );
  if (id && !(await tx.department.findFirst({ where: { id, isActive: true } })))
    throw new HttpError(400, "DEPARTMENT_INVALID", "请选择有效部门。");
}
export async function saveUser(actor: Actor, input: unknown, id?: string) {
  await authorize(actor, id ? "users.update" : "users.create");
  const v = parse(userSchema, input);
  if (v.role === "CONTENT_REVIEWER") await authorize(actor, "roles.manage");
  await reauthenticate(actor, v.reauthPassword);
  await limit("account-write:" + actor.id, 30);
  let initialPassword: string | undefined, passwordHash: string | undefined;
  if (!id) {
    localCredentialDelivery();
    initialPassword = randomToken();
    passwordHash = await hashPassword(initialPassword);
  }
  const user = await serial(async (tx) => {
    await checkActor(tx, actor);
    await department(tx, v.departmentId, v.role);
    const old = id ? await tx.adminUser.findUnique({ where: { id } }) : null;
    if (id && !old) throw new HttpError(404, "NOT_FOUND", "员工不存在。");
    if (
      old?.role === "SUPER_ADMIN" &&
      old.isActive &&
      (!v.isActive || v.role !== "SUPER_ADMIN") &&
      (await tx.adminUser.count({
        where: {
          role: "SUPER_ADMIN",
          isActive: true,
          OR: [
            { mustChangePassword: false },
            { initialCredentialExpiresAt: { gt: new Date() } },
          ],
        },
      })) <= 1
    )
      throw new HttpError(
        409,
        "LAST_SUPER_ADMIN",
        "不能停用或降级唯一有效超级管理员。",
      );
    // Moving an employee with assigned leads needs explicit reassignment first.
    if (
      old &&
      old.departmentId !== v.departmentId &&
      (await tx.lead.count({ where: { assignedTo: old.id } }))
    )
      throw new HttpError(
        409,
        "REASSIGN_REQUIRED",
        "请先重新分配该员工负责的线索，再更改部门。",
      );
    const data = {
      name: v.name,
      email: v.email,
      role: v.role,
      departmentId: v.departmentId,
      isActive: v.isActive,
    };
    const user = old
      ? await tx.adminUser.update({
          where: { id: old.id },
          data: { ...data, sessionVersion: { increment: 1 } },
          select: publicUserSelect,
        })
      : await tx.adminUser.create({
          data: {
            ...data,
            passwordHash: passwordHash!,
            mustChangePassword: true,
            initialCredentialExpiresAt: new Date(Date.now() + 15 * 60 * 1000),
          },
          select: publicUserSelect,
        });
    if (old) await tx.adminSession.deleteMany({ where: { adminId: old.id } });
    const actions = old
      ? [
          "USER_UPDATE",
          ...(old.role !== v.role ? ["ROLE_CHANGE"] : []),
          ...(old.isActive !== v.isActive
            ? [v.isActive ? "USER_ENABLE" : "USER_DISABLE"]
            : []),
        ]
      : ["USER_CREATE"];
    if (v.role === "CONTENT_REVIEWER" && old?.role !== "CONTENT_REVIEWER")
      actions.push("CONTENT_REVIEWER_GRANT");
    if (old?.role === "CONTENT_REVIEWER" && v.role !== "CONTENT_REVIEWER")
      actions.push("CONTENT_REVIEWER_REVOKE");
    for (const action of actions)
      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          action,
          resourceType: "admin_user",
          resourceId: user.id,
          metadata: {
            role: v.role,
            previousRole: old?.role || null,
            departmentId: v.departmentId,
            isActive: v.isActive,
          },
        },
      });
    return user;
  });
  return {
    user,
    ...(initialPassword ? { initialPassword, expiresInMinutes: 15 } : {}),
  };
}
export async function resetPassword(actor: Actor, id: string, input: unknown) {
  await authorize(actor, "users.update");
  localCredentialDelivery();
  const v = parse(
    z.object({ reauthPassword: z.string().max(128) }).strict(),
    input,
  );
  await reauthenticate(actor, v.reauthPassword);
  await limit("reset:" + actor.id, 5);
  if (id === actor.id)
    throw new HttpError(400, "SELF_RESET", "请使用个人资料中的修改密码。");
  const initialPassword = randomToken(),
    passwordHash = await hashPassword(initialPassword);
  await serial(async (tx) => {
    await checkActor(tx, actor);
    const user = await tx.adminUser.findUnique({ where: { id } });
    if (!user) throw new HttpError(404, "NOT_FOUND", "员工不存在。");
    await tx.adminUser.update({
      where: { id },
      data: {
        passwordHash,
        mustChangePassword: true,
        initialCredentialExpiresAt: new Date(Date.now() + 900000),
        sessionVersion: { increment: 1 },
      },
    });
    await tx.adminSession.deleteMany({ where: { adminId: id } });
    await tx.auditLog.create({
      data: {
        actorId: actor.id,
        action: "PASSWORD_RESET",
        resourceType: "admin_user",
        resourceId: id,
      },
    });
  });
  return { initialPassword, expiresInMinutes: 15 };
}
export async function changePassword(actor: Actor, input: unknown) {
  const v = parse(changePasswordSchema, input);
  await limit("password-change:" + actor.id, 5);
  const user = await db().adminUser.findUniqueOrThrow({
    where: { id: actor.id },
  });
  if (!(await verify(user.passwordHash, v.oldPassword).catch(() => false)))
    throw new HttpError(400, "WRONG_PASSWORD", "原密码不正确。");
  if (v.oldPassword === v.newPassword)
    throw new HttpError(400, "PASSWORD_REUSED", "新密码不能与原密码相同。");
  const passwordHash = await hashPassword(v.newPassword);
  await serial(async (tx) => {
    await checkActor(tx, actor);
    await tx.adminUser.update({
      where: { id: actor.id },
      data: {
        passwordHash,
        mustChangePassword: false,
        initialCredentialExpiresAt: null,
        sessionVersion: { increment: 1 },
      },
    });
    await tx.adminSession.deleteMany({ where: { adminId: actor.id } });
    await tx.auditLog.create({
      data: {
        actorId: actor.id,
        action: "PASSWORD_CHANGE",
        resourceType: "admin_user",
        resourceId: actor.id,
      },
    });
  });
  return { redirect: "/admin/login/" };
}
export async function saveDepartment(
  actor: Actor,
  input: unknown,
  id?: string,
) {
  await authorize(actor, "departments.manage");
  const v = parse(
    z
      .object({
        name: z.string().trim().min(1).max(80),
        isActive: z.boolean(),
        reauthPassword: z.string().max(128),
      })
      .strict(),
    input,
  );
  await reauthenticate(actor, v.reauthPassword);
  return serial(async (tx) => {
    await checkActor(tx, actor);
    if (
      id &&
      !v.isActive &&
      ((await tx.adminUser.count({
        where: { departmentId: id, isActive: true },
      })) ||
        (await tx.lead.count({ where: { departmentId: id } })))
    )
      throw new HttpError(
        409,
        "DEPARTMENT_IN_USE",
        "该部门仍有有效员工或线索，请先完成转移。",
      );
    const d = id
      ? await tx.department.update({
          where: { id },
          data: { name: v.name, isActive: v.isActive },
        })
      : await tx.department.create({
          data: { name: v.name, isActive: v.isActive },
        });
    await tx.auditLog.create({
      data: {
        actorId: actor.id,
        action: id ? "DEPARTMENT_UPDATE" : "DEPARTMENT_CREATE",
        resourceType: "department",
        resourceId: d.id,
        metadata: { isActive: d.isActive },
      },
    });
    return d;
  });
}
export async function assignLead(actor: Actor, id: string, input: unknown) {
  await authorize(actor, "leads.assign_department");
  const v = parse(
    z
      .object({
        assignedTo: z.string().max(64).nullable(),
        reauthPassword: z.string().max(128).optional(),
      })
      .strict(),
    input,
  );
  if (actor.role === "SUPER_ADMIN")
    await reauthenticate(actor, v.reauthPassword || "");
  await limit("assign:" + actor.id, 30);
  return serial(async (tx) => {
    await checkActor(tx, actor);
    const lead = await tx.lead.findUnique({ where: { id } });
    if (!lead) throw new HttpError(404, "NOT_FOUND", "线索不存在。");
    if (
      actor.role !== "SUPER_ADMIN" &&
      (!actor.departmentId ||
        lead.departmentId !== actor.departmentId ||
        !lead.assignedTo)
    )
      throw new HttpError(403, "FORBIDDEN", "不能分配范围外的线索。");
    const target = v.assignedTo
      ? await tx.adminUser.findUnique({
          where: { id: v.assignedTo },
          include: { department: true },
        })
      : null;
    if (
      v.assignedTo &&
      (!target ||
        !target.isActive ||
        !target.department?.isActive ||
        !["FINANCING_ADVISOR", "SALES_MANAGER"].includes(target.role))
    )
      throw new HttpError(
        400,
        "ASSIGNEE_INVALID",
        "请选择有效部门内的主管或顾问。",
      );
    if (
      actor.role !== "SUPER_ADMIN" &&
      (!target || target.departmentId !== actor.departmentId)
    )
      throw new HttpError(403, "FORBIDDEN", "只能分配给本部门员工。");
    const result = await tx.lead.update({
      where: { id },
      data: {
        assignedTo: target?.id ?? null,
        departmentId: target?.departmentId ?? null,
      },
      select: { id: true, assignedTo: true, departmentId: true },
    });
    await tx.auditLog.create({
      data: {
        actorId: actor.id,
        action: "LEAD_ASSIGN",
        resourceType: "lead",
        resourceId: id,
        metadata: {
          assignedTo: result.assignedTo,
          departmentId: result.departmentId,
        },
      },
    });
    return result;
  }).catch(async (error) => {
    if (error instanceof HttpError && error.status === 403)
      await db().auditLog.create({
        data: {
          actorId: actor.id,
          action: "PERMISSION_DENIED",
          resourceType: "lead_assignment",
          resourceId: id.slice(0, 64),
        },
      });
    throw error;
  });
}
