import { ReviewBatch } from "@/components/forms/ReviewBatch";
import { InternalEvidence } from "@/components/forms/InternalEvidence";
import { reviewerPool } from "@/features/geo/review-policy";
import { pendingFactReviews } from "@/features/generation/fact-actions";
import Link from "next/link";
import { pageActor } from "@/lib/auth/page";
import { can } from "@/lib/auth/permissions";
import { reviewQueue } from "@/features/geo/reviews";
import { db } from "@/lib/db";
import { contentStatuses, reviewDecisions } from "@/features/geo/config";
export const metadata = { title: "内容审核中心" };
const date = (v: Date | string | null) =>
  v
    ? new Date(v).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })
    : "未记录";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const actor = await pageActor("content.read"),
    query = await searchParams,
    result = await reviewQueue(query, actor);
  const reviewers = await reviewerPool(db());
  const singleReviewer = reviewers.length < 2;
  const link = (view: string, page = 1) =>
    "?" +
    new URLSearchParams({
      view,
      page: String(page),
      ...(query.type ? { type: query.type } : {}),
      ...(query.q ? { q: query.q } : {}),
      ...(query.mine === "true" && ["pending", "ready"].includes(view)
        ? { mine: "true" }
        : {}),
    });
  return (
    <>
      <h1>内容审核中心</h1>
      {can(actor, "content.review") && (
        <section className="admin-panel">
          <h2>AI文章事实复核待办</h2>
          <p>
            最近100条申请中符合你独立审核资格的待办；处理后仍须走正式审核与授权发布。
          </p>
          <ul>
            {(await pendingFactReviews(actor)).map((r) => (
              <li key={r.id}>
                <Link href={`/admin/geo/articles/${r.articleId}/`}>
                  {r.title} · 版本{r.revision} · {date(r.createdAt)}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
      <ReviewBatch
        canAssign={can(actor, "content.assign_review")}
        canReview={can(actor, "content.review")}
      />
      {can(actor, "content.assign_review") && (
        <InternalEvidence
          records={(
            await db().articleSource.findMany({
              where: { articleId: null, sourceType: "INTERNAL_BANK" },
              orderBy: { updatedAt: "desc" },
              take: 100,
            })
          ).map((r) => ({
            id: r.id,
            title: r.title,
            sourceUrl: r.sourceUrl,
            excerpt: r.excerpt,
            isActive: r.isActive,
            verifiedAt: r.verifiedAt?.toISOString() || null,
            validUntil: r.validUntil?.toISOString() || null,
          }))}
        />
      )}
      {singleReviewer && (
        <aside className="admin-panel">
          <p>
            当前缺少足够的有效独立审核人员。本人参与的内容不能自审，请由超级管理员通过正式员工授权流程安排独立审核员。
          </p>
          {can(actor, "content.assign_review") && (
            <Link href="/admin/settings/users/new/?role=CONTENT_REVIEWER">
              按正式权限流程新增独立审核员 →
            </Link>
          )}
          <p>系统不会自动提升任何员工权限。</p>
        </aside>
      )}
      <p>
        待审核内容只有经过另一位授权人员核验后才能批准；批准后仍需单独发布。此处不会自动审核或批量发布。
      </p>
      {!can(actor, "content.review") && (
        <p role="note">当前账号没有审核权限，请联系超级管理员。</p>
      )}
      {can(actor, "content.review") && (
        <p>
          你拥有审核权限。自己创作、编辑或提交的版本不能自审；请交由另一位具有审核权限的独立审核人员复核。
        </p>
      )}
      {can(actor, "content.review") && (
        <nav className="admin-nav" aria-label="审核任务范围">
          <Link href="?view=pending&mine=true">分配给我的待办</Link>
          <Link href="?view=pending">全部待审核内容</Link>
        </nav>
      )}
      {query.mine === "true" && ["pending", "ready"].includes(result.view) && (
        <p>
          当前仅显示明确分配给你的任务；审核资格仍按最新账号和版本条件检查。
        </p>
      )}
      <nav className="admin-nav">
        {Object.entries({
          pending: "待审核内容",
          ready: "待发布内容",
          approved: "已审核记录",
          rejected: "已驳回记录",
          history: "全部审核历史",
        }).map(([k, v]) => (
          <Link
            key={k}
            href={link(k)}
            aria-current={result.view === k ? "page" : undefined}
          >
            {v}
          </Link>
        ))}
      </nav>
      <form className="admin-panel account-filter">
        <input name="view" type="hidden" value={result.view} />
        {query.mine === "true" &&
          ["pending", "ready"].includes(result.view) && (
            <input name="mine" type="hidden" value="true" />
          )}
        <label>
          内容类型
          <select name="type" defaultValue={query.type || ""}>
            <option value="">全部类型</option>
            <option value="articles">文章</option>
            <option value="faqs">常见问答</option>
          </select>
        </label>
        <label>
          标题或问题
          <input name="q" defaultValue={query.q} maxLength={100} />
        </label>
        <button className="button outline">筛选</button>
      </form>
      <p>
        共 {result.total}{" "}
        条。待审核列表每页每种类型最多25条；历史记录按审核时间倒序。
      </p>
      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>标题 / 问题</th>
              <th>类型</th>
              <th>作者</th>
              <th>提交 / 导入时间</th>
              <th>当前版本</th>
              <th>当前状态</th>
              <th>审核记录</th>
              <th>审核职责与缺失项</th>
              <th>入口</th>
            </tr>
          </thead>
          <tbody>
            {result.items.map((i) => (
              <tr key={i.review?.id || i.kind + i.id}>
                <td>{i.title}</td>
                <td>{i.kind === "articles" ? "文章" : "常见问答"}</td>
                <td>{i.author || "历史未记录"}</td>
                <td>
                  {i.submittedAt
                    ? date(i.submittedAt)
                    : i.importedAt
                      ? "导入：" + date(i.importedAt)
                      : "历史提交时间未记录"}
                  {i.submitter && <p>提交人：{i.submitter}</p>}
                </td>
                <td>{i.revision}</td>
                <td>{contentStatuses[i.status]}</td>
                <td>
                  {i.review ? (
                    <>
                      <p>
                        版本{i.review.revision} ·{" "}
                        {reviewDecisions[i.review.decision]} ·{" "}
                        {i.review.reviewer}
                      </p>
                      <p>{date(i.review.createdAt)}</p>
                      <p>{i.review.note}</p>
                    </>
                  ) : result.view === "ready" ? (
                    "已审核，等待单独发布"
                  ) : (
                    "等待人工核验"
                  )}
                </td>
                <td>
                  {i.policy ? (
                    <>
                      <p>
                        当前分配：{i.policy.assigneeName || "未分配"} ·
                        合格审核人{i.policy.qualifiedCount}位
                      </p>
                      <p>
                        {i.policy.canReview
                          ? "你可审核本版本"
                          : i.policy.reason}
                      </p>
                      {!i.policy.qualifiedCount && (
                        <p>
                          阻塞：没有未参与本版本的合格审核账号，请管理员正式授权独立审核员。
                        </p>
                      )}
                      {i.policy.missingItems.map((s) => (
                        <p key={s}>{s}</p>
                      ))}
                    </>
                  ) : (
                    "请进入内容详情查看固定版本与审核记录"
                  )}
                </td>
                <td>
                  <Link href={`/admin/geo/${i.kind}/${i.id}/`}>
                    {result.view === "pending" ? "查看与审核" : "查看与发布"}
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!result.items.length && <p>当前筛选下没有记录。</p>}
      <nav className="admin-nav">
        {result.page > 1 && (
          <Link href={link(result.view, result.page - 1)}>上一页</Link>
        )}
        {result.hasNext && (
          <Link href={link(result.view, result.page + 1)}>下一页</Link>
        )}
      </nav>
    </>
  );
}
