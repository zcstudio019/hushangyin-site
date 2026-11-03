import Link from "next/link";
import { ContentMeasurement } from "@/components/analytics/ContentMeasurement";
import { analyticsEnabled } from "@/features/analytics/config";
import { notFound } from "next/navigation";
import { siteUrl } from "@/config/site";
import { publicFaq, faqPath, faqDescription } from "@/features/geo/public-faq";
import { publishedArticles } from "@/features/geo/public";
import { articlePath } from "@/features/geo/config";
import { SafeMarkdown, safeHref } from "@/components/content/SafeMarkdown";
export const dynamic = "force-dynamic";
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const f = await publicFaq((await params).id);
  if (!f) return { robots: { index: false, follow: false } };
  return {
    title: f.snapshot.question + "｜沪上银融资问答",
    description: faqDescription(f.snapshot.answer),
    alternates: { canonical: siteUrl() + faqPath(f.id) },
  };
}
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const f = await publicFaq((await params).id);
  if (!f) notFound();
  const s = f.snapshot,
    related = (await publishedArticles())
      .filter((a) => a.id === s.articleId || a.snapshot.category === s.category)
      .slice(0, 4);
  const data = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: [
      {
        "@type": "Question",
        name: s.question,
        acceptedAnswer: { "@type": "Answer", text: s.answer },
      },
    ],
    url: siteUrl() + faqPath(f.id),
  };
  return (
    <>
      <ContentMeasurement kind="FAQ" id={f.id} enabled={analyticsEnabled()}/>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(data).replace(/</g, "\\u003c"),
        }}
      />
      <section className="page-banner">
        <div className="shell">
          <h1>{s.question}</h1>
          <p>{s.category}</p>
        </div>
      </section>
      <article className="section shell narrow-copy geo-prose">
        <Link href="/faqs/">← 全部融资问答</Link>
        <p>
          {s.publishedAt &&
            "发布时间：" + new Date(s.publishedAt).toLocaleDateString("zh-CN")}
          {s.modifiedAt &&
            " · 更新时间：" +
              new Date(s.modifiedAt).toLocaleDateString("zh-CN")}
        </p>
        <SafeMarkdown content={s.answer} />
        <h2>引用来源</h2>
        <ul>
          {s.sources.map((r, i) => (
            <li key={i}>
              {safeHref(r.url) ? (
                <a href={r.url} rel="noreferrer nofollow">
                  {r.title}
                </a>
              ) : (
                r.title
              )}
              {r.checkedAt && "（核验日期：" + r.checkedAt + "）"}
            </li>
          ))}
        </ul>
        <aside className="notice">
          <h2>融资风险提示</h2>
          <p>
            以上为一般知识，不构成具体贷款产品推荐或审批承诺。应核对金融机构的现行要求，评估真实资金需求、融资成本与还款能力。
          </p>
        </aside>
        <h2>相关知识文章</h2>
        <ul>
          {related.map((a) => (
            <li key={a.id}>
              <Link href={articlePath(a.slug)}>{a.snapshot.title}</Link>
            </li>
          ))}
        </ul>
        <Link className="button gold" href={`/contact/?faq=${f.id}`}>
          获取融资咨询
        </Link>
      </article>
    </>
  );
}
