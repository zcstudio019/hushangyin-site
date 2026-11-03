import Link from "next/link";
import { can, roleNames } from "@/lib/auth/permissions";
import { notFound } from "next/navigation";
import { pageActor } from "@/lib/auth/page";
import { db } from "@/lib/db";
import { publicUserSelect } from "@/features/accounts/service";
import {
  UserForm,
  ResetPasswordForm,
  ReviewerGrantForm,
} from "@/components/forms/AccountForms";
export const metadata = { title: "编辑员工" };
export default async function EditUser({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ grant?: string }>;
}) {
  const a = await pageActor("users.update");
  const u = await db().adminUser.findUnique({
    where: { id: (await params).id },
    select: publicUserSelect,
  });
  if (!u) notFound();
  const grantMode =
    (await searchParams).grant === "reviewer" && !can(u, "content.review");
  const history = await db().auditLog.findMany({
    where: {
      resourceType: "admin_user",
      resourceId: u.id,
      action: {
        in: [
          "CONTENT_REVIEWER_GRANT",
          "CONTENT_REVIEWER_REVOKE",
          "ROLE_CHANGE",
          "USER_ENABLE",
          "USER_DISABLE",
        ],
      },
    },
    include: { actor: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
    take: 15,
  });
  const actions: Record<string, string> = {
    CONTENT_REVIEWER_GRANT: "授予审核权限",
    CONTENT_REVIEWER_REVOKE: "取消审核权限",
    ROLE_CHANGE: "岗位角色变更",
    USER_ENABLE: "账号启用",
    USER_DISABLE: "账号停用",
  };
  return (
    <>
      <h1>编辑员工</h1>
      <section className="admin-panel" id="review-permission">
        <h2>内容审核权限配置</h2>
        <p>
          员工：{u.name} · 当前角色：{roleNames[u.role]} · 部门：
          {u.department?.name || "未分配部门"}。
        </p>
        <p>
          审核权限：{can(u, "content.review") ? "已具备" : "未授予"}；账号状态：
          {u.isActive ? "启用" : "已停用"}；首次激活：
          {u.mustChangePassword ? "待员工完成首次改密" : "已完成，无需重复改密"}
          。
        </p>
        {u.mustChangePassword && (
          <p>
            请由员工使用自己的账号进入<Link href="/admin/login/">登录页</Link>
            ，按引导在个人资料页完成首次改密。管理员不代填员工新密码。
          </p>
        )}
        {grantMode ? (
          <ReviewerGrantForm user={u} />
        ) : can(u, "content.review") ? (
          <p>
            若需取消或调整权限，请在下方员工角色表单选择合适岗位，验证当前管理员密码后保存。历史审批记录保持。
          </p>
        ) : (
          <Link
            className="button gold"
            href="?grant=reviewer#review-permission"
          >
            授予内容审核权限 →
          </Link>
        )}
        <p>
          角色、启用状态变更会失效旧会话；无需改动已初始化员工的密码。新角色不会自动获得客户或敏感金融资料权限。
        </p>
      </section>
      {!grantMode && (
        <section id="employee-role-form">
          <h2>员工资料与角色</h2>
          <UserForm
            user={u}
            departments={await db().department.findMany({
              orderBy: { name: "asc" },
            })}
          />
        </section>
      )}
      {!grantMode && u.id !== a.id && (
        <>
          <h2>安全重置密码</h2>
          <ResetPasswordForm id={u.id} />
        </>
      )}
      <section className="admin-panel">
        <h2>最近授权与账号状态记录</h2>
        {!history.length && <p>尚无此类记录。</p>}
        {history.map((h) => {
          const m = h.metadata as {
            previousRole?: keyof typeof roleNames;
            role?: keyof typeof roleNames;
          } | null;
          return (
            <p key={h.id}>
              {h.createdAt.toLocaleString("zh-CN", {
                timeZone: "Asia/Shanghai",
              })}{" "}
              · {h.actor?.name || "历史账号"} · {actions[h.action]} ·{" "}
              {m?.previousRole ? roleNames[m.previousRole] : "旧角色未记录"} →{" "}
              {m?.role ? roleNames[m.role] : "未记录"}
            </p>
          );
        })}
      </section>
    </>
  );
}
