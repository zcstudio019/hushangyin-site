import Link from "next/link";
import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { publishedArticle } from "@/features/geo/public";
import {
  PublicArticleContent,
  KnowledgeIndex,
} from "@/components/content/PublicContent";
import { publicPages, publicPaths } from "@/features/content/pages";
import { siteUrl, brand } from "@/config/site";
import { ContactContent } from "@/components/forms/ContactContent";
import { articleSources } from "@/features/content/sources";
import { consultationAvailable } from "@/lib/consultation-availability";
type Props = {
  params: Promise<{ slug?: string[] }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};
export const dynamic = "force-dynamic";
function pathOf(slug?: string[]) {
  return slug?.length ? "/" + slug.join("/") + "/" : "/";
}
export function generateStaticParams() {
  return publicPaths.map((path) => ({
    slug: path === "/" ? [] : path.split("/").filter(Boolean),
  }));
}
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const path = pathOf((await params).slug),
    page = publicPages[path];
  if (path.startsWith("/insights/") && path !== "/insights/") {
    const article = await publishedArticle(path.split("/")[2]);
    if (!article) return {};
    const s = article.snapshot;
    return {
      title:
        s.seoTitle ||
        (s.title.includes("｜") ? s.title : s.title + "｜沪上银融资知识"),
      description: s.metaDescription || s.summary,
      alternates: { canonical: siteUrl() + path },
      openGraph: {
        type: "article",
        title: s.title,
        description: s.metaDescription || s.summary,
        url: siteUrl() + path,
      },
      robots: { index: true, follow: true },
    };
  }
  if (!page) return {};
  const canonical = siteUrl() + path;
  return {
    title: page.title,
    description: page.description,
    alternates: { canonical },
    openGraph: {
      title: page.title,
      description: page.description,
      url: canonical,
      type:
        path.startsWith("/insights/") && path !== "/insights/"
          ? "article"
          : "website",
      locale: "zh_CN",
      siteName: brand.name,
    },
    robots: { index: true, follow: true },
  };
}
export default async function PublicPage({ params, searchParams }: Props) {
  const path = pathOf((await params).slug),
    page = publicPages[path];
  if (path.startsWith("/knowledge/"))
    permanentRedirect(path.replace("/knowledge/", "/insights/"));
  if (path === "/insights/") return <KnowledgeIndex />;
  if (path.startsWith("/insights/")) {
    if (path.split("/").filter(Boolean).length !== 2) notFound();
    const article = await publishedArticle(path.split("/")[2]);
    if (!article) notFound();
    return <PublicArticleContent article={article} />;
  }
  if (!page) notFound();
  const url = siteUrl() + path;
  const data: Record<string, unknown>[] = [
    {
      "@context": "https://schema.org",
      "@type": "WebPage",
      name: page.title,
      description: page.description,
      url,
      inLanguage: "zh-CN",
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        {
          "@type": "ListItem",
          position: 1,
          name: "首页",
          item: siteUrl() + "/",
        },
        ...(path === "/"
          ? []
          : [
              {
                "@type": "ListItem",
                position: 2,
                name: page.title.split("｜")[0],
                item: url,
              },
            ]),
      ],
    },
  ];
  if (path.startsWith("/insights/") && path !== "/insights/")
    data.push({
      "@context": "https://schema.org",
      "@type": "Article",
      headline: page.title.split("｜")[0],
      description: page.description,
      mainEntityOfPage: url,
      inLanguage: "zh-CN",
    });
  const available = consultationAvailable();
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(data).replace(/</g, "\\u003c"),
        }}
      />
      {path === "/contact/" ? (
        <ContactContent
          available={available}
          localTestMode={process.env.LOCAL_TEST_MODE === "true"}
          sourceArticleId={
            typeof (await searchParams).article === "string"
              ? ((await searchParams).article as string)
              : undefined
          }
          sourceFaqId={typeof (await searchParams).faq === "string" ? (await searchParams).faq as string : undefined}
          attributionToken={typeof (await searchParams).attribution === "string" ? (await searchParams).attribution as string : undefined}
          sourceParameters={
            Object.fromEntries(
              Object.entries(await searchParams).filter(
                ([key, value]) =>
                  ["utm_source", "utm_medium", "utm_campaign"].includes(key) &&
                  typeof value === "string",
              ),
            ) as Record<string, string>
          }
        />
      ) : (
        <div
          className="content-fragment"
          dangerouslySetInnerHTML={{ __html: page.html }}
        />
      )}
      {articleSources[path] && (
        <aside className="section shell narrow-copy">
          <h2>参考资料</h2>
          <p>
            以上为一般知识与申请前准备建议，具体产品准入及材料清单以金融机构要求为准。
          </p>
          <ul>
            {articleSources[path].map((source) => (
              <li key={source.href}>
                <Link
                  href={source.href}
                  rel="noopener noreferrer"
                  style={{ textDecoration: "underline" }}
                >
                  {source.title}
                </Link>
              </li>
            ))}
          </ul>
        </aside>
      )}
    </>
  );
}
