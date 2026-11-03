import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { pageActor } from "@/lib/auth/page";
import { can, canReadLeads } from "@/lib/auth/permissions";
import { db } from "@/lib/db";
import { AssignmentForm } from "@/components/forms/AccountForms";
import { customerTypeNames, sourceParameterNames } from "@/config/admin-labels";
import { leadDetail } from "@/features/leads/admin";
import { HttpError } from "@/lib/http";
import { StatusForm } from "@/components/forms/AdminForms";
import {channels,confidences,sourceKinds} from "@/features/analytics/config";
export const metadata = { title: "线索详情" };
export default async function Detail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const actor = await pageActor();
  if (!canReadLeads(actor)) redirect("/admin/settings/profile/?denied=1");
  const lead = await leadDetail(actor, (await params).id).catch((error) => {
    if (error instanceof HttpError && error.status === 404) notFound();
    throw error;
  });
  return (
    <>
      <Link href="/admin/leads/">← 返回线索列表</Link>
      <h1>线索详情</h1>
      <dl className="lead-details">
        {Object.entries({
          称呼: lead.name,
          电话: lead.phone,
          客户类型: customerTypeNames[lead.customerType],
          当前负责人: lead.assignee
            ? lead.assignee.name +
              (lead.assignee.isActive ? "" : "（已停用，待重新分配）")
            : "未分配",
          所属部门: lead.department?.name || "未分配",
          融资金额: lead.financingAmount,
          是否有房产:
            lead.hasProperty === null
              ? "未填写"
              : lead.hasProperty
                ? "是"
                : "否",
          是否有企业:
            lead.hasCompany === null ? "未填写" : lead.hasCompany ? "是" : "否",
          补充说明: lead.remark || "无",
          来源页面: lead.sourcePage,
          来源文章: lead.sourceArticleId || "直接咨询",
          来源标记:
            lead.sourceParameters &&
            typeof lead.sourceParameters === "object" &&
            !Array.isArray(lead.sourceParameters)
              ? Object.entries(lead.sourceParameters)
                  .map(
                    ([key, value]) =>
                      `${sourceParameterNames[key] || "其他标记"}：${String(value)}`,
                  )
                  .join("；") || "无"
              : "无",
          提交时间: lead.createdAt.toLocaleString("zh-CN", {
            timeZone: "Asia/Shanghai",
          }),
        }).map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd style={{ margin: 0, whiteSpace: "pre-wrap" }}>{value}</dd>
          </div>
        ))}
      </dl>
      <StatusForm id={lead.id} status={lead.status} />
      <section className="admin-panel"><h2>获客来源</h2>{lead.attribution ? <>
        <p>来源类型：{sourceKinds[lead.attribution.sourceType]} · 来源渠道：{channels[lead.attribution.channel]||"来源未知"}</p>
        {lead.attribution.contentTitle&&<p>来源内容：<Link href={lead.attribution.path}>{lead.attribution.contentTitle}</Link>（{lead.attribution.article?.isLive||lead.attribution.faq?.isLive?"当前公开":"历史来源，当前可能已下线"}）</p>}
        <p>有效来源说明：{confidences[lead.attribution.confidence]||"未知"}。不证明外部平台实际曝光或用户身份。</p>
        <p>来源路径：{lead.attribution.path}；提交时间：{lead.attribution.createdAt.toLocaleString("zh-CN",{timeZone:"Asia/Shanghai"})}</p>
        <p>营销来源：{lead.attribution.utmSource||"未提供"}；媒介：{lead.attribution.utmMedium||"未提供"}；活动：{lead.attribution.utmCampaign||"未提供"}（均为来源参数线索）</p>
      </> : <p>暂无有效归因记录；历史线索不回填为GEO。</p>}</section>
      {can(actor, "leads.assign_department") && (
        <>
          <h2>线索分配</h2>
          <AssignmentForm
            id={lead.id}
            assignedTo={lead.assignedTo}
            superAdmin={actor.role === "SUPER_ADMIN"}
            users={await db().adminUser.findMany({
              where: {
                isActive: true,
                role: { in: ["SALES_MANAGER", "FINANCING_ADVISOR"] },
                department: { isActive: true },
                ...(actor.role === "SUPER_ADMIN"
                  ? {}
                  : { departmentId: actor.departmentId ?? "" }),
              },
              select: {
                id: true,
                name: true,
                department: { select: { name: true } },
              },
              orderBy: { name: "asc" },
            })}
          />
        </>
      )}
      <h2>授权记录</h2>
      {lead.consents.map((consent, i) => (
        <p key={i}>
          {consent.policyVersion} ·{" "}
          {consent.agreedAt.toLocaleString("zh-CN", {
            timeZone: "Asia/Shanghai",
          })}{" "}
          · 融资咨询联系授权
        </p>
      ))}
    </>
  );
}
