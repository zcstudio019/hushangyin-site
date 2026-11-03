import { redirect } from "next/navigation";
import { currentAdmin } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { roleNames } from "@/lib/auth/permissions";
import { PasswordForm } from "@/components/forms/AccountForms";
export const metadata = { title: "个人资料与修改密码" };
export default async function Profile() {
  const a = await currentAdmin();
  if (!a) redirect("/admin/login/");
  const u = await db().adminUser.findUniqueOrThrow({
    where: { id: a.id },
    select: {
      email: true,
      lastLoginAt: true,
      department: { select: { name: true } },
    },
  });
  return (
    <>
      <h1>个人资料</h1>
      <div className="admin-panel">
        <p>员工姓名：{a.name}</p>
        <p>登录邮箱：{u.email}</p>
        <p>当前角色：{roleNames[a.role]}</p>
        <p>部门：{u.department?.name || "未设置"}</p>
        <p>
          最近登录：
          {u.lastLoginAt?.toLocaleString("zh-CN", {
            timeZone: "Asia/Shanghai",
          }) || "暂无记录"}
        </p>
      </div>
      {a.mustChangePassword && (
        <p role="alert">
          首次登录或密码已重置，请先修改初始密码，其他后台操作暂不可用。
        </p>
      )}
      <h2 id="password">修改密码</h2>
      <PasswordForm />
    </>
  );
}
