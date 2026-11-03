import Link from "next/link";
import { pageActor } from "@/lib/auth/page";
import { can } from "@/lib/auth/permissions";
import { visibilityData } from "@/features/analytics/visibility";
import { publishedArticles } from "@/features/geo/public";
import { VisibilityForm } from "@/components/forms/AnalyticsForms";
export const metadata = { title: "GEO可见性抽样观察" };
export default async function Page() {
  const actor = await pageActor("analytics.read"),
    rows = await visibilityData(actor);
  return (
    <>
      <h1>GEO可见性人工观察</h1>
      <Link href="/admin/geo/analytics/">返回内容分析</Link>
      <p>
        人工记录仅为经实际核验的抽样，不代表全平台排名或所有用户结果。品牌提及、官网链接引用、明确推荐分别记录；AI平台来源访问仅是第一方来源线索，不能反推引用。
      </p>
      <div className="admin-panel">
        <p>
          最近{rows.length}条抽样中的品牌提及：
          {rows.length ? rows.filter((r) => r.brandMention).length : "暂无数据"}
          ；官网链接引用：
          {rows.length ? rows.filter((r) => r.siteCitation).length : "暂无数据"}
          ；明确推荐：
          {rows.length
            ? rows.filter((r) => r.recommendation).length
            : "暂无数据"}
          。
        </p>
        <p>自动AI引用监测：尚未接入；不展示虚构推荐量。</p>
      </div>
      {can(actor, "visibility.write") && (
        <VisibilityForm
          articles={(await publishedArticles()).map((a) => ({
            id: a.id,
            title: a.snapshot.title,
          }))}
        />
      )}
      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              {[
                "平台",
                "实际查询",
                "测试日期",
                "品牌提及",
                "官网引用",
                "推荐",
                "证据与被引用内容",
                "记录人",
              ].map((s) => (
                <th key={s}>{s}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>{r.platform}</td>
                <td>{r.query}</td>
                <td>{r.observedOn.toISOString().slice(0, 10)}</td>
                <td>{r.brandMention ? "是" : "否"}</td>
                <td>{r.siteCitation ? "是" : "否"}</td>
                <td>{r.recommendation ? "是" : "否"}</td>
                <td>
                  <a href={r.evidenceUrl} target="_blank" rel="noreferrer">
                    查看结果证据
                  </a>
                  <p>{r.evidenceNote}</p>
                  {r.article && (
                    <Link href={`/insights/${r.article.slug}/`}>
                      {r.article.title}
                      {!r.article.isLive && "（当前下线）"}
                    </Link>
                  )}
                </td>
                <td>{r.actor.name}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length && <p>暂无人工核验记录。</p>}
      </div>
    </>
  );
}
