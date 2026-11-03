import { publicFaqUrls, faqPath } from "@/features/geo/public-faq";
import type { MetadataRoute } from "next";
import { publicPaths } from "@/features/content/pages";
import { siteUrl } from "@/config/site";
import { publishedArticles } from "@/features/geo/public";
import { articlePath } from "@/features/geo/config";
export const dynamic = "force-dynamic";
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const fixed: MetadataRoute.Sitemap = publicPaths
    .filter((path) => !path.startsWith("/insights/") || path === "/insights/")
    .map((path) => ({
      url: siteUrl() + path,
      changeFrequency: path.startsWith("/insights/") ? "monthly" : "weekly",
    }));
  return [
    ...fixed,
    { url: siteUrl() + "/faqs/", changeFrequency: "weekly" },
    ...(await publicFaqUrls()).map((f) => ({
      url: siteUrl() + faqPath(f.id),
      ...(f.modifiedAt ? { lastModified: f.modifiedAt } : {}),
      changeFrequency: "monthly" as const,
    })),
    ...(await publishedArticles()).map((a) => ({
      url: siteUrl() + articlePath(a.slug),
      ...(a.snapshot.modifiedAt ? { lastModified: a.snapshot.modifiedAt } : {}),
      changeFrequency: "monthly" as const,
    })),
  ];
}
