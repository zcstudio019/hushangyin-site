import Link from "next/link";
import { pageActor } from "@/lib/auth/page";
import { db } from "@/lib/db";
import { publishedArticles } from "@/features/geo/public";
export const metadata = { title: "GEO内容运营中心" };
export default async function GeoDashboard() {
  await pageActor("content.read");
  const p = db();
  const [total, live, pending, drafts, questions, faqs, recent, todo] =
    await Promise.all([
      p.article.count(),
      p.article.count({ where: { isLive: true } }),
      p.article.count({ where: { status: "IN_REVIEW" } }),
      p.article.count({ where: { status: "DRAFT" } }),
      p.geoQuestion.count({ where: { status: { not: "ARCHIVED" } } }),
      p.faq.count(),
      publishedArticles().then((rows) => rows.slice(0, 5)),
      p.article.findMany({
        where: { status: "IN_REVIEW" },
        orderBy: { updatedAt: "asc" },
        take: 10,
        select: { id: true, title: true },
      }),
    ]);
  const faqTodo = await p.faq.findMany({
    where: { status: "IN_REVIEW" },
    take: 10,
    orderBy: { updatedAt: "asc" },
    select: { id: true, question: true },
  });
  return (
    <>
      <h1>GEO内容运营中心</h1>
      <p>以下为实际内容数据。尚未接入流量和智能推荐统计。</p>
      <div className="geo-metrics">
        {Object.entries({
          文章总数: total,
          已发布线上文章: live,
          待审核文章: pending,
          草稿文章: drafts,
          融资问题: questions,
          常见问答数量: faqs,
        }).map(([label, n]) => (
          <div className="admin-panel" key={label}>
            <h2>{label}</h2>
            <strong>{n}</strong>
          </div>
        ))}
      </div>
      <p>线上版本与改稿状态独立统计，同一文章可以有线上版本及待审核改稿。</p>
      <h2>最近发布内容</h2>
      <ul>
        {recent.map((a) => (
          <li key={a.id}>
            <Link href={`/admin/geo/articles/${a.id}/`}>
              {a.snapshot.title}
            </Link>
          </li>
        ))}
      </ul>
      <h2>内容审核待办</h2>
      <ul>
        {todo.map((a) => (
          <li key={a.id}>
            <Link href={`/admin/geo/articles/${a.id}/`}>{a.title}</Link>
          </li>
        ))}
        {faqTodo.map((f) => (
          <li key={f.id}>
            <Link href={`/admin/geo/faqs/${f.id}/`}>问答：{f.question}</Link>
          </li>
        ))}
      </ul>
      {!todo.length && !faqTodo.length && <p>暂无待审核内容。</p>}
    </>
  );
}
