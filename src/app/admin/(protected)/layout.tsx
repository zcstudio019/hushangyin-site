import Link from "next/link";
import { redirect } from "next/navigation";
import { currentAdmin } from "@/lib/auth/session";
import { LogoutButton } from "@/components/forms/AdminForms";
import { can, canReadLeads } from "@/lib/auth/permissions";
export default async function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const actor = await currentAdmin();
  if (!actor) redirect("/admin/login/");
  return (
    <>
      <header className="admin-header">
        <div>
          <b>沪上银 · 管理后台</b>
          <p>{actor.name}</p>
        </div>
        <nav className="admin-nav" aria-label="后台导航">
          {!actor.mustChangePassword && (
            <Link href="/admin/dashboard/">管理首页</Link>
          )}
          {!actor.mustChangePassword && canReadLeads(actor) && (
            <Link href="/admin/leads/">咨询线索</Link>
          )}
          {!actor.mustChangePassword && can(actor,"content.read")&&<Link href="/admin/geo/">GEO内容中心</Link>}
          <Link href="/admin/settings/profile/">个人资料 / 修改密码</Link>
          {!actor.mustChangePassword && can(actor, "users.read") && (
            <Link href="/admin/settings/users/">员工管理</Link>
          )}
          {!actor.mustChangePassword && can(actor, "departments.manage") && (
            <Link href="/admin/settings/departments/">部门管理</Link>
          )}
          {!actor.mustChangePassword && can(actor, "roles.manage") && (
            <Link href="/admin/settings/roles/">角色与权限</Link>
          )}
          <Link href="/">官网</Link>
          <LogoutButton />
        </nav>
      </header>
      <main>{children}</main>
    </>
  );
}
