import Link from "next/link";
import { redirect } from "next/navigation";
import { pageActor } from "@/lib/auth/page";
import { canReadLeads } from "@/lib/auth/permissions";
import { listLeads } from "@/features/leads/admin";
import { leadStatusNames } from "@/lib/validations/consultation";
export const metadata = { title: "咨询线索" };
export default async function Leads({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const actor = await pageActor();
  if (!canReadLeads(actor)) redirect("/admin/settings/profile/?denied=1");
  const requested = Number((await searchParams).page || 1);
  const page =
    Number.isInteger(requested) && requested >= 1 && requested <= 10000
      ? requested
      : 1;
  const result = await listLeads(actor, page);
  return (
    <>
      <h1>咨询线索</h1>
      <p>共 {result.total} 条；列表手机号已脱敏。</p>
      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>称呼</th>
              <th>电话</th>
              <th>状态</th>
              <th>提交时间</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {result.items.map((lead) => (
              <tr key={lead.id}>
                <td>{lead.name}</td>
                <td>{lead.phone}</td>
                <td>{leadStatusNames[lead.status]}</td>
                <td>
                  {lead.createdAt.toLocaleString("zh-CN", {
                    timeZone: "Asia/Shanghai",
                  })}
                </td>
                <td>
                  <Link href={`/admin/leads/${lead.id}/`}>查看详情</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!result.items.length && <p>暂无可访问的线索。</p>}
      <nav className="admin-nav" aria-label="分页">
        {page > 1 && <Link href={`?page=${page - 1}`}>上一页</Link>}
        <span>第 {page} 页</span>
        {page * 25 < result.total && (
          <Link href={`?page=${page + 1}`}>下一页</Link>
        )}
      </nav>
    </>
  );
}
