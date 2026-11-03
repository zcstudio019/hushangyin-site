import Link from "next/link";
import { pageActor } from "@/lib/auth/page";
import { userQuery } from "@/features/accounts/queries";
import { can, roleNames } from "@/lib/auth/permissions";
export const metadata = { title: "员工管理" };
export default async function Users({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  await pageActor("users.read");
  const q = await searchParams,
    r = await userQuery(q);
  const pageLink = (page: number) =>
    `?${new URLSearchParams({ ...Object.fromEntries(Object.entries(q).filter((e): e is [string, string] => typeof e[1] === "string")), page: String(page) })}`;
  return (
    <>
      <h1>员工管理</h1>
      <Link className="button gold" href="/admin/settings/users/new/">
        新增员工
      </Link>
      <form className="admin-panel account-filter">
        <label>
          搜索姓名或邮箱
          <input name="q" defaultValue={q.q} maxLength={80} />
        </label>
        <label>
          角色
          <select name="role" defaultValue={q.role || ""}>
            <option value="">全部角色</option>
            {Object.entries(roleNames).map(([k, v]) => (
              <option value={k} key={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <label>
          状态
          <select name="active" defaultValue={q.active || ""}>
            <option value="">全部状态</option>
            <option value="true">启用</option>
            <option value="false">停用</option>
          </select>
        </label>
        <button className="button outline">搜索</button>
      </form>
      <p>共 {r.total} 名员工</p>
      <div className="admin-table-wrap">
        <table className="admin-table staff-table">
          <thead>
            <tr>
              {["姓名", "邮箱", "角色", "部门", "状态", "最近登录", "操作"].map(
                (s) => (
                  <th key={s}>{s}</th>
                ),
              )}
            </tr>
          </thead>
          <tbody>
            {r.items.map((u) => (
              <tr key={u.id}>
                <td>{u.name}</td>
                <td>{u.email}</td>
                <td>
                  {roleNames[u.role]}
                  <p>审核权限：{can(u, "content.review") ? "有" : "无"}</p>
                </td>
                <td>{u.department?.name || "—"}</td>
                <td>
                  {u.isActive ? "启用" : "停用"}
                  {u.mustChangePassword ? " / 待改密" : ""}
                </td>
                <td>
                  {u.lastLoginAt?.toLocaleString("zh-CN", {
                    timeZone: "Asia/Shanghai",
                  }) || "未登录"}
                </td>
                <td>
                  <Link href={`/admin/settings/users/${u.id}/`}>
                    编辑 / 重置
                  </Link>
                  <p>
                    <Link
                      href={`/admin/settings/users/${u.id}/${can(u, "content.review") ? "#review-permission" : "?grant=reviewer#review-permission"}`}
                    >
                      {can(u, "content.review")
                        ? "查看审核权限"
                        : "配置审核权限"}
                    </Link>
                  </p>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <nav className="admin-nav" aria-label="员工分页">
        {r.page > 1 && <Link href={pageLink(r.page - 1)}>上一页</Link>}
        <span>第 {r.page} 页</span>
        {r.page * 25 < r.total && (
          <Link href={pageLink(r.page + 1)}>下一页</Link>
        )}
      </nav>
    </>
  );
}
