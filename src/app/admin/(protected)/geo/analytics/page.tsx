import Link from "next/link";
import { AnalyticsTrend } from "@/components/analytics/AnalyticsTrend";
import { pageActor } from "@/lib/auth/page";
import { analyticsReport } from "@/features/analytics/report";
import { channels } from "@/features/analytics/config";
import { categories } from "@/features/geo/config";
export const metadata = { title: "GEO效果与咨询归因" };
const number = (n: number | null) =>
  n === null ? "暂无数据" : n.toLocaleString("zh-CN");
const rate = (n: number | null) =>
  n === null ? "暂无数据" : (n * 100).toFixed(1) + "%";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const actor = await pageActor("analytics.read"),
    q = await searchParams,
    r = await analyticsReport(actor, q);
  return (
    <>
      <h1>GEO效果与咨询归因</h1>
      <nav className="admin-nav">
        <Link href="/admin/geo/analytics/search/">搜索平台数据</Link>
        <Link href="/admin/geo/visibility/">GEO人工可见性观察</Link>
      </nav>
      <p>
        仅展示第一方授权样本和真实咨询记录。访问不是AI引用，匿名标记不是客户身份。
        {r.enabled
          ? "可选分析已开启，仍需逐窗口明确同意。"
          : "可选分析未启用；现有记录仍可查询。"}
      </p>
      <form className="admin-panel account-filter">
        <label>
          时间范围
          <select name="days" defaultValue={r.days}>
            {[7, 30, 90].map((n) => (
              <option key={n} value={n}>
                最近{n}天
              </option>
            ))}
          </select>
        </label>
        <label>
          文章分类
          <select name="category" defaultValue={q.category || ""}>
            <option value="">全部（含FAQ）</option>
            {categories.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        <label>
          排行榜排序
          <select name="sort" defaultValue={q.sort || "consults"}>
            <option value="consults">成功咨询数</option>
            <option value="conversion">转化率（充足样本优先）</option>
          </select>
        </label>
        <button className="button outline">查看</button>
      </form>
      {r.localTestMode && (
        <p className="analytics-environment">
          本地开发 /
          测试环境：可能包含人工验收流量，不代表生产经营效果。分析仅在访客主动同意后开启；咨询授权与可选分析分开处理。
        </p>
      )}
      <div className="analytics-cards">
        {[
          ["文章PV", number(r.articlePv), "已授权公开文章浏览；不含问答"],
          ["咨询按钮点击", number(r.clicks), "已授权文章及问答的咨询点击"],
          [
            "文章成功咨询",
            number(r.articleConsults),
            "真实入库且来源为文章的咨询",
          ],
          [
            "已归因内容咨询",
            number(r.attributedLeads),
            "文章及问答；包括未同意访问分析的咨询",
          ],
          ["按日匿名访问", number(r.visits), "短期会话去重，不代表自然人"],
          [
            "授权样本转化率",
            r.lowSample ? "样本不足" : rate(r.conversion),
            "至少20次匿名访问才显示，不以全量线索除PV",
          ],
        ].map(([label, value, note]) => (
          <section className="analytics-card" key={label}>
            <h2>{label}</h2>
            <strong>{value}</strong>
            <p>{note}</p>
          </section>
        ))}
      </div>
      <div className="admin-panel">
        <p>
          当前已发布文章：{r.publishedArticles}；已发布FAQ：{r.publishedFaqs}
          （当前状态，不受时间筛选影响）。全部内容PV：{number(r.pv)}。
        </p>
        <p>
          统计区间：{r.startDay}至{r.endDay}（上海时间）。数据最后更新时间：
          <time>
            {r.lastUpdatedAt?.toLocaleString("zh-CN", {
              timeZone: "Asia/Shanghai",
            }) || "暂无数据"}
          </time>
          （当前筛选内最后一次事件聚合或归因写入，不是页面刷新时间）。
        </p>
        <p>
          暂无数据表示缺少有效采集记录；0表示在已有采集样本中实际记录为零。咨询来源记录可以独立存在，不能据此补造访问或点击。
        </p>
      </div>
      <details className="admin-panel" open>
        <summary>指标口径与限制</summary>
        <p>
          PV为已同意采集的公开内容浏览事件；重复事件ID不重复计数。去重访问按“日×内容×短期匿名会话”去重，跨天或新窗口不能视为同一人。
        </p>
        <p>
          成功咨询来自原咨询事务中的新线索及归因记录，不靠浏览器成功按钮计数。转化率=至少一次成功咨询的授权日匿名访问÷授权日匿名访问，最多30分钟归因窗口，按来源访问日计入；同一会话多次咨询只计一个转化访问，不能与全量咨询数/PV混算。
        </p>
        <p>
          拒绝可选分析的人仍可咨询及保存必要内容来源；其咨询计入来源总数，但不计分析转化率。没有采集样本时显示“暂无数据”。UTM/渠道为客户端线索，历史线索不自动补归因；数据不代表搜索曝光或AI推荐。
        </p>
      </details>
      <h2>内容转化排行榜</h2>
      <p>
        匿名访问少于20次时标记低样本，不按转化率优先排名。分类筛选只影响文章口径；未筛选时总览包含FAQ访问。
      </p>
      <div className="analytics-ranking-wrap">
        <table className="admin-table analytics-ranking">
          <thead>
            <tr>
              <th>文章</th>
              <th>PV / 匿名访问</th>
              <th>咨询点击</th>
              <th>成功咨询</th>
              <th>访问到咨询转化率</th>
              <th>来源与更新</th>
            </tr>
          </thead>
          <tbody>
            {r.ranking.map((a) => (
              <tr key={a.id}>
                <td data-label="文章">
                  <Link href={a.path}>{a.title}</Link>
                  {!a.isLive && "（已下线历史）"}
                  <small>
                    发布：
                    {a.publishedAt?.toLocaleDateString("zh-CN", {
                      timeZone: "Asia/Shanghai",
                    }) || "未记录"}{" "}
                    ·{" "}
                    <Link href={`/admin/geo/articles/${a.id}/`}>内容详情</Link>
                  </small>
                </td>
                <td data-label="PV / 匿名访问">
                  {number(a.pv)}
                  <small>访问：{number(a.visits)}</small>
                </td>
                <td data-label="咨询点击">{number(a.clicks)}</td>
                <td data-label="成功咨询">{number(a.consults)}</td>
                <td data-label="转化率">
                  {a.lowSample && a.visits !== null
                    ? "样本不足"
                    : rate(a.conversion)}
                </td>
                <td data-label="来源与更新">
                  <details>
                    <summary>查看详情</summary>
                    <p>
                      {a.channels
                        .map((c) => channels[c] || "来源未知")
                        .join("、") || "暂无来源样本"}
                    </p>
                    <small>
                      数据更新：
                      {a.dataUpdatedAt?.toLocaleString("zh-CN", {
                        timeZone: "Asia/Shanghai",
                      }) || "暂无数据"}
                    </small>
                  </details>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!r.ranking.length && <p>暂无内容表现数据。</p>}
      </div>
      <h2>最近{r.days}天趋势</h2>
      <AnalyticsTrend days={r.trend} />
    </>
  );
}
