import { QuestionGuide } from "@/components/content/QuestionOverview";
import Link from "next/link";
import { pageActor } from "@/lib/auth/page";
import { can } from "@/lib/auth/permissions";
import { kindOf, contentList } from "@/features/geo/service";
import {
  categories,
  contentStatusLabel,
  contentStatuses,
  questionStatuses,
} from "@/features/geo/config";
import { QuestionImport } from "@/components/forms/GeoForms";
import { MarkdownImport } from "@/components/forms/MarkdownImport";
export const metadata = { title: "内容管理" };
export default async function GeoList({
  params,
  searchParams,
}: {
  params: Promise<{ kind: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const a = await pageActor("content.read"),
    kind = kindOf((await params).kind),
    q = await searchParams,
    result = await contentList(kind, q),
    title = {
      articles: "文章管理",
      faqs: "常见问答管理",
      questions: "融资问题库",
    }[kind],
    statuses = kind === "questions" ? questionStatuses : contentStatuses;
  const pageLink = (page: number) =>
    "?" +
    new URLSearchParams({
      ...Object.fromEntries(
        Object.entries(q).filter(
          (e): e is [string, string] => typeof e[1] === "string",
        ),
      ),
      page: String(page),
    });
  return (
    <>
      <h1>{title}</h1>
      {kind === "questions" && <QuestionGuide />}
      {kind !== "questions" && (
        <p>
          <Link href="/admin/geo/reviews/">进入统一内容审核中心 →</Link>{" "}
          {kind === "faqs" && <Link href="/faqs/">查看已发布问答</Link>}
        </p>
      )}
      {can(a, "content.create") && (
        <Link className="button gold" href={`/admin/geo/${kind}/new/`}>
          新增{kind === "articles" ? "文章" : kind === "faqs" ? "问答" : "问题"}
        </Link>
      )}
      <form className="admin-panel account-filter">
        <label>
          搜索标题、问题或文章标签
          <input name="q" defaultValue={q.q} maxLength={100} />
        </label>
        <label>
          分类
          <select name="category" defaultValue={q.category || ""}>
            <option value="">全部分类</option>
            {categories.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        <label>
          状态
          <select name="status" defaultValue={q.status || ""}>
            <option value="">全部状态</option>
            {Object.entries(statuses).map(([k, v]) => (
              <option value={k} key={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <button className="button outline">筛选</button>
      </form>
      <p>共 {result.total} 条</p>
      <div className="admin-table-wrap">
        <table className="admin-table geo-list-table">
          <thead>
            <tr>
              {[
                "标题 / 问题",
                "分类",
                "状态",
                "线上版本 / 公开解答",
                "更新时间",
                "操作",
              ].map((s) => (
                <th key={s}>{s}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {result.items.map((item) => (
              <tr key={item.id}>
                <td>{"title" in item ? item.title : item.question}</td>
                <td>{item.category}</td>
                <td>
                  {kind === "questions"
                    ? questionStatuses[
                        item.status as keyof typeof questionStatuses
                      ]
                    : contentStatusLabel(
                        item.status,
                        "revision" in item ? item.revision : undefined,
                        "reviews" in item ? item.reviews[0] : undefined,
                      )}
                </td>
                <td>
                  {"isLive" in item
                    ? item.isLive
                      ? "公开"
                      : "未公开"
                    : "_count" in item
                      ? `${item._count.articleLinks}篇关联文章 · ${item.articleLinks.some((l) => l.article.isLive) ? "有公开解答" : "暂无公开解答"}`
                      : "—"}
                </td>
                <td>
                  {item.updatedAt.toLocaleString("zh-CN", {
                    timeZone: "Asia/Shanghai",
                  })}
                </td>
                <td>
                  <Link href={`/admin/geo/${kind}/${item.id}/`}>
                    查看 / 编辑
                  </Link>
                  {kind === "questions" &&
                    can(a, "generation.create") &&
                    item.status !== "ARCHIVED" && (
                      <p>
                        <Link
                          href={"/admin/geo/generation/?questionId=" + item.id}
                        >
                          生成文章
                        </Link>
                      </p>
                    )}
                  {kind === "questions" &&
                    can(a, "content.create") &&
                    item.status !== "ARCHIVED" && (
                      <p>
                        <Link
                          href={
                            "/admin/geo/articles/new/?questionId=" + item.id
                          }
                        >
                          创建文章
                        </Link>
                      </p>
                    )}
                  {kind === "questions" && (
                    <p>
                      <Link href={"/admin/geo/questions/" + item.id + "/"}>
                        查看关联文章与历史
                      </Link>
                    </p>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <nav className="admin-nav" aria-label="内容分页">
        {result.page > 1 && (
          <Link href={pageLink(result.page - 1)}>上一页</Link>
        )}
        <span>第 {result.page} 页</span>
        {result.page * 25 < result.total && (
          <Link href={pageLink(result.page + 1)}>下一页</Link>
        )}
      </nav>
      {kind === "questions" && can(a, "content.create") && <QuestionImport />}
      {(kind === "questions" || kind === "faqs") &&
        can(a, "content.create") && <MarkdownImport kind={kind} />}
    </>
  );
}
