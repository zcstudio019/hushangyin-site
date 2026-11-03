import Link from "next/link";
import { pageActor } from "@/lib/auth/page";
import { can } from "@/lib/auth/permissions";
import { searchData } from "@/features/analytics/search";
import { platforms } from "@/features/analytics/config";
import { SearchManagement } from "@/components/forms/AnalyticsForms";
export const metadata = { title: "搜索平台数据源" };
export default async function Page() {
  const actor = await pageActor("analytics.read"),
    r = await searchData(actor);
  return (
    <>
      <h1>搜索平台数据源</h1>
      <Link href="/admin/geo/analytics/">返回第一方分析</Link>
      <p>
        所有平台API尚未授权，自动同步未开通；导入数据仅代表人工提交的真实导出，不能等同AI引用或推荐。
      </p>
      <div className="admin-panel">
        {!r.connections.length ? (
          <p>暂无数据源；暂无搜索曝光或点击数据。</p>
        ) : (
          r.connections.map((c) => (
            <p key={c.id}>
              {c.label} · {platforms[c.platform as keyof typeof platforms]} ·{" "}
              {c.siteUrl} · {c.isActive ? "人工数据源启用" : "已停用"} ·
              API未授权 · 最后导入：
              {c.lastImportedAt?.toLocaleString("zh-CN") || "暂无"}
            </p>
          ))
        )}
      </div>
      {can(actor, "analytics.manage") && (
        <SearchManagement
          connections={r.connections.map((c) => ({
            id: c.id,
            label: c.label,
            platform: c.platform,
            siteUrl: c.siteUrl,
            isActive: c.isActive,
          }))}
        />
      )}
      <h2>已导入的平台日数据</h2>
      <p>
        日期和维度保持平台原始导出；本站访问统计为上海时间，两者不直接相加。这里只展示最近500条导入日记录，不是全站GEO排名。
      </p>
      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              {[
                "来源",
                "平台日期",
                "点击",
                "曝光",
                "点击率",
                "平均排名",
                "更新时间",
              ].map((s) => (
                <th key={s}>{s}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {r.metrics.map((m) => (
              <tr key={m.id}>
                <td>{m.connection.label}（人工日期CSV）</td>
                <td>{m.day.toISOString().slice(0, 10)}</td>
                <td>{m.clicks}</td>
                <td>{m.impressions}</td>
                <td>
                  {m.impressions
                    ? ((m.clicks / m.impressions) * 100).toFixed(2) + "%"
                    : "暂无数据"}
                </td>
                <td>{m.averagePosition ?? "暂无数据"}</td>
                <td>{m.updatedAt.toLocaleString("zh-CN")}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!r.metrics.length && (
          <p>暂无已取得的搜索平台数据，不能以文章PV代替曝光。</p>
        )}
      </div>
      <h2>导入与同步任务</h2>
      {!r.jobs.length && <p>暂无任务。</p>}
      {r.jobs.map((j) => (
        <p key={j.id}>
          {j.connection.label} ·{" "}
          {j.kind === "CSV_IMPORT" ? "CSV人工导入" : "API同步条件检查"} ·{" "}
          {j.status === "COMPLETED"
            ? "已完成"
            : j.status === "BLOCKED"
              ? "未开通/未授权，已阻止"
              : "待核对"}{" "}
          · {j.createdAt.toLocaleString("zh-CN")}
        </p>
      ))}
    </>
  );
}
