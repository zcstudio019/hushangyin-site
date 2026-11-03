import Link from "next/link";
import { pageActor } from "@/lib/auth/page";
import { canReadLeads } from "@/lib/auth/permissions";
import { db } from "@/lib/db";
import { scope } from "@/features/leads/admin";
import { leadStatusNames } from "@/lib/validations/consultation";
export const metadata = { title: "管理首页" };
export default async function Dashboard() {
  const actor = await pageActor();
  if (!canReadLeads(actor))
    return (
      <>
        <h1>管理首页</h1>
        <p>当前角色未获客户线索访问权限。</p><Link href="/admin/geo/">进入GEO内容运营中心</Link>
        <Link href="/admin/settings/profile/">个人资料</Link>
      </>
    );
  const counts = await db().$transaction(async (tx) => {
    const items = await tx.lead.groupBy({
      by: ["status"],
      where: scope(actor),
      _count: { _all: true },
    });
    await tx.auditLog.create({
      data: {
        actorId: actor.id,
        action: "DASHBOARD_READ",
        resourceType: "lead",
      },
    });
    return items;
  });
  return (
    <>
      <h1>管理首页</h1>
      <p>仅显示您有权访问的咨询线索。</p>
      <div className="tw:grid tw:grid-cols-1 tw:md:grid-cols-3 tw:gap-4">
        {counts.map((item) => (
          <div className="admin-panel" key={item.status}>
            <b>{leadStatusNames[item.status]}</b>
            <p>{item._count._all}</p>
          </div>
        ))}
      </div>
      <Link className="button gold" href="/admin/leads/">
        查看咨询线索
      </Link>
    </>
  );
}
