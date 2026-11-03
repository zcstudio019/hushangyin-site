import Link from "next/link";
import { siteUrl } from "@/config/site";
import { categories } from "@/features/geo/config";
import { publicFaqs, faqPath, faqDescription } from "@/features/geo/public-faq";
export const dynamic = "force-dynamic";
export function generateMetadata() {
  return {
    title: "融资常见问答｜沪上银",
    description:
      "查看经人工审核发布的融资常见问答、申请准备与风险提示，具体条件以金融机构要求为准。",
    alternates: { canonical: siteUrl() + "/faqs/" },
  };
}
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ category?: string; page?: string }>;
}) {
  const result = await publicFaqs(await searchParams);
  const link = (page: number) =>
    "?" +
    new URLSearchParams({
      page: String(page),
      ...(result.category ? { category: result.category } : {}),
    });
  return (
    <>
      <section className="page-banner">
        <div className="shell">
          <h1>融资常见问答</h1>
          <p>
            经人工审核的知识解答，帮助理解融资准备与风险，不构成审批或放款承诺。
          </p>
        </div>
      </section>
      <section className="section shell">
        <p>
          <Link href="/insights/">← 融资知识库</Link>
        </p>
        <form className="account-filter">
          <label>
            问答分类
            <select name="category" defaultValue={result.category || ""}>
              <option value="">全部分类</option>
              {categories.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
          <button className="button gold">筛选问答</button>
        </form>
        <p>共{result.total}条已发布问答</p>
        <div className="grid article-grid">
          {result.items.map((f) => (
            <article className="article-card" key={f.id}>
              <span className="mini-tag">{f.snapshot.category}</span>
              <h2>
                <Link href={faqPath(f.id)}>{f.snapshot.question}</Link>
              </h2>
              <p>{faqDescription(f.snapshot.answer)}</p>
              <Link href={faqPath(f.id)}>阅读完整解答 →</Link>
            </article>
          ))}
        </div>
        {!result.items.length && (
          <p>当前分类暂无已发布问答。内部待审核内容不会显示在这里。</p>
        )}
        <nav className="admin-nav" aria-label="问答分页">
          {result.page > 1 && <Link href={link(result.page - 1)}>上一页</Link>}
          {result.page * 20 < result.total && (
            <Link href={link(result.page + 1)}>下一页</Link>
          )}
        </nav>
        <p>
          融资前应评估资金用途、现金流和还款能力；机构审核和产品条件可能变化，请核对适用信息。
        </p>
        <Link className="button gold" href="/contact/">
          获取融资咨询
        </Link>
      </section>
    </>
  );
}
