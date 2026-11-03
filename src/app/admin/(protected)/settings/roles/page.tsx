import { pageActor } from "@/lib/auth/page";
import {
  roleNames,
  rolePermissions,
  permissionNames,
} from "@/lib/auth/permissions";
export const metadata = { title: "角色与权限" };
export default async function Roles() {
  await pageActor("roles.manage");
  return (
    <>
      <h1>角色与权限</h1>
      <p>
        四种内置角色采用统一权限规则。通过员工编辑页面分配角色；内容审核与发布仍由服务端逐项验证。
      </p>
      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>角色</th>
              <th>权限</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(roleNames).map(([k, v]) => (
              <tr key={k}>
                <td>{v}</td>
                <td>
                  {rolePermissions[k as keyof typeof roleNames]
                    .map((p) => permissionNames[p])
                    .join("、")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
