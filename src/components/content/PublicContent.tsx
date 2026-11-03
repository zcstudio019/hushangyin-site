import Link from "next/link";
import { ContentMeasurement } from "@/components/analytics/ContentMeasurement";
import { analyticsEnabled } from "@/features/analytics/config";
import { articlePath } from "@/features/geo/config";
import { siteUrl } from "@/config/site";
import {
  publishedArticles,
  publishedFaqs,
  type PublicArticle,
} from "@/features/geo/public";
import { SafeMarkdown, safeHref } from "./SafeMarkdown";
const ld = (v: unknown) => JSON.stringify(v).replace(/</g, "\\u003c");
export async function KnowledgeIndex() {
  const rows = await publishedArticles();
  return (
    <>
      <section className="page-banner">
        <div className="shell">
          <div className="eyebrow">FINANCING INSIGHTS / HUSHANGYIN</div>
          <h1>沪上银 · 融资知识库</h1>
          <p>
            围绕上海企业融资、征信管理与现金流规划，持续解答真实的融资问题。
          </p>
        </div>
        <div className="banner-lines" />
      </section>
      <section className="section shell">
        <p><Link href="/faqs/">查看融资常见问答 →</Link></p>
        <div className="grid article-grid">
          {rows.map((a) => (
            <Link
              className="article-card"
              href={articlePath(a.slug)}
              key={a.id}
            >
              <div className="article-top">
                <span>KNOWLEDGE</span>
                <span>↗</span>
              </div>
              <span className="mini-tag">{a.snapshot.category}</span>
              <h3>{a.snapshot.title.split("｜")[0]}</h3>
              <p>{a.snapshot.summary}</p>
              <span className="article-bottom">阅读完整文章 →</span>
            </Link>
          ))}
        </div>
        {!rows.length && <p>暂无已发布文章。</p>}
      </section>
      <section className="cta-section shell">
        <div>
          <h2>融资之前，先把方案想清楚。</h2>
          <p>从经营情况、负债结构到还款来源，获得更有依据的下一步建议。</p>
        </div>
        <Link className="button gold" href="/contact/">
          预约融资咨询 ↗
        </Link>
      </section>
    </>
  );
}
export async function PublicArticleContent({
  article,
  preview = false,
}: {
  article: PublicArticle;
  preview?: boolean;
}) {
  const s = article.snapshot,
    faqs = preview ? [] : await publishedFaqs(article.id),
    related = preview
      ? []
      : (await publishedArticles()).filter((a) => s.relatedIds.includes(a.id));
  const url = siteUrl() + articlePath(s.slug);
  const data = [
    {
      "@context": "https://schema.org",
      "@type": "Article",
      headline: s.title.split("｜")[0],
      description: s.summary,
      mainEntityOfPage: url,
      inLanguage: "zh-CN",
      ...(s.authorName
        ? { author: { "@type": "Person", name: s.authorName } }
        : {}),
      ...(s.publishedAt ? { datePublished: s.publishedAt } : {}),
      ...(s.modifiedAt ? { dateModified: s.modifiedAt } : {}),
      citation: s.sources.map((x) => x.url),
    },
    ...(faqs.length
      ? [
          {
            "@context": "https://schema.org",
            "@type": "FAQPage",
            mainEntity: faqs.map((f) => ({
              "@type": "Question",
              name: f.question,
              acceptedAnswer: { "@type": "Answer", text: f.answer },
            })),
          },
        ]
      : []),
  ];
  return (
    <>
      {!preview && <ContentMeasurement kind="ARTICLE" id={article.id} enabled={analyticsEnabled()}/>}
      {!preview && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: ld(data) }}
        />
      )}
      {preview && (
        <p role="note" className="notice">
          内部草稿预览，不代表已经发布或核验。
        </p>
      )}
      {s.contentFormat === "LEGACY_HTML" && s.legacyHtml ? (
        <div
          className="content-fragment"
          dangerouslySetInnerHTML={{ __html: s.legacyHtml }}
        />
      ) : (
        <article className="section shell narrow-copy geo-article">
          <p>
            <Link href="/insights/">融资知识库</Link> / {s.category}
          </p>
          <h1>{s.title}</h1>
          <p className="lead">{s.summary}</p>
          <p>
            {s.authorName && <>作者：{s.authorName}　</>}
            {s.publishedAt && (
              <>
                发布：
                <time dateTime={s.publishedAt}>
                  {s.publishedAt.slice(0, 10)}
                </time>
                　
              </>
            )}
            {s.modifiedAt && (
              <>
                更新：
                <time dateTime={s.modifiedAt}>{s.modifiedAt.slice(0, 10)}</time>
              </>
            )}
          </p>
          <SafeMarkdown content={s.content} />
          {s.tags.length > 0 && <p>标签：{s.tags.join("、")}</p>}
        </article>
      )}
      {s.sources.length > 0 && (
        <aside className="section shell narrow-copy">
          <h2>参考资料</h2>
          <p>
            以上为一般知识与申请前准备建议，具体产品准入及材料清单以金融机构要求为准。
          </p>
          <ul>
            {s.sources.map((r, i) => (
              <li key={i}>
                {safeHref(r.url) ? (
                  <a href={r.url} rel="noopener noreferrer nofollow">
                    {r.title}
                  </a>
                ) : (
                  r.title
                )}
                {r.checkedAt && <>（核验日期：{r.checkedAt}）</>}
                {r.paragraph && (
                  <blockquote>对应正文：{r.paragraph}</blockquote>
                )}
              </li>
            ))}
          </ul>
        </aside>
      )}
      {faqs.length > 0 && (
        <section className="section shell narrow-copy">
          <h2>相关问答</h2>
          {faqs.map((f) => (
            <details key={f.id}>
              <summary>{f.question}</summary>
              <SafeMarkdown content={f.answer} />
            </details>
          ))}
        </section>
      )}
      {related.length > 0 && (
        <aside className="section shell narrow-copy">
          <h2>相关知识文章</h2>
          <ul>
            {related.map((a) => (
              <li key={a.id}>
                <Link href={articlePath(a.slug)}>{a.snapshot.title}</Link>
              </li>
            ))}
          </ul>
        </aside>
      )}
      {!preview && (
        <section className="cta-section shell">
          <div>
            <h2>结合实际情况，了解融资准备方向。</h2>
            <p>咨询不保证审批或放款；请勿提交征信、流水及身份证明文件。</p>
          </div>
          <Link
            className="button gold"
            data-article-cta
            href={`/contact/?article=${article.id}`}
          >
            获取融资方案 ↗
          </Link>
        </section>
      )}
    </>
  );
}
