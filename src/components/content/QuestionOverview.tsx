import Link from "next/link";
import { db } from "@/lib/db";
import {
  questionStatuses,
  contentStatuses,
  articlePath,
} from "@/features/geo/config";
export function QuestionGuide() {
  return (
    <aside className="admin-panel">
      <h2>选题状态与公开内容</h2>
      <p>
        融资问题是内部选题，不生成空白公开页面。待规划：尚未安排；已规划：进入内容计划或已建立草稿；已解答：存在有效已发布的关联文章；已归档：暂不处理，可在编辑页恢复。
      </p>
      <p>
        点击“创建文章”保存人工草稿 → 提交审核 → 另一位授权人员核验 →
        发布。发布和下线会重新计算问题状态；没有公开解答不能手工标为已解答。
      </p>
    </aside>
  );
}
export async function QuestionOverview({
  id,
  canCreate,
}: {
  id: string;
  canCreate: boolean;
}) {
  const [links, history] = await Promise.all([
    db().articleQuestionRelation.findMany({
      where: { questionId: id },
      include: {
        article: {
          select: {
            id: true,
            title: true,
            slug: true,
            status: true,
            isLive: true,
            publishedSnapshot: true,
          },
        },
      },
      orderBy: { createdAt: "asc" },
    }),
    db().auditLog.findMany({
      where: {
        resourceType: "geo_questions",
        resourceId: id,
        action: "QUESTION_STATUS_CHANGE",
      },
      include: { actor: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
  ]);
  return (
    <section className="admin-panel">
      <h2>关联文章与状态历史</h2>
      <p>
        关联文章 {links.length} 篇 ·{" "}
        {links.some((l) => l.article.isLive && l.article.publishedSnapshot)
          ? "存在已公开解答"
          : "暂无已公开解答"}
      </p>
      {canCreate && (
        <Link
          className="button gold"
          href={"/admin/geo/articles/new/?questionId=" + id}
        >
          从此问题创建文章
        </Link>
      )}
      <ul>
        {links.map((l) => (
          <li key={l.articleId}>
            <Link href={"/admin/geo/articles/" + l.article.id + "/"}>
              {l.article.title}
            </Link>{" "}
            · {contentStatuses[l.article.status]}{" "}
            {l.article.isLive && (
              <Link href={articlePath(l.article.slug)}>查看公开文章</Link>
            )}
          </li>
        ))}
      </ul>
      <h3>状态变更历史</h3>
      {!history.length && (
        <p>尚无状态变更记录；本次修复前未记录的历史不会补造。</p>
      )}
      {history.map((h) => {
        const m = h.metadata as {
          from?: keyof typeof questionStatuses;
          to?: keyof typeof questionStatuses;
        };
        return (
          <p key={h.id}>
            {h.createdAt.toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })}{" "}
            · {h.actor?.name || "系统"} ·{" "}
            {m.from ? questionStatuses[m.from] : "未记录"} →{" "}
            {m.to ? questionStatuses[m.to] : "未记录"}
          </p>
        );
      })}
    </section>
  );
}
