import { databaseProvider } from "@/lib/db/provider";
import "server-only";
import { db } from "@/lib/db";
import type { Snapshot } from "./validation";
export type PublicArticle = { id: string; slug: string; snapshot: Snapshot };
export async function publishedArticle(
  slug: string,
): Promise<PublicArticle | null> {
  const a = await db().article.findFirst({
    where: { slug, isLive: true },
    select: { id: true, slug: true, publishedSnapshot: true },
  });
  if (!a?.publishedSnapshot) return null;
  return {
    id: a.id,
    slug: a.slug,
    snapshot: a.publishedSnapshot as unknown as Snapshot,
  };
}
export async function publishedArticles() {
  if (databaseProvider() !== "postgresql") {
    const rows = await db().article.findMany({
      where: { isLive: true },
      select: { id: true, slug: true, publishedSnapshot: true },
      orderBy: { createdAt: "asc" },
    });
    return rows
      .filter((a) => a.publishedSnapshot)
      .map((a) => {
        const snapshot = {
          ...(a.publishedSnapshot as unknown as Snapshot),
        } as Partial<Snapshot>;
        delete snapshot.content;
        delete snapshot.legacyHtml;
        return {
          id: a.id,
          slug: a.slug,
          snapshot: snapshot as Omit<Snapshot, "content" | "legacyHtml">,
        };
      })
      .sort((a, b) =>
        (b.snapshot.modifiedAt || "").localeCompare(
          a.snapshot.modifiedAt || "",
        ),
      );
  }
  // List and sitemap queries do not transfer every full article body.
  return db().$queryRaw<
    {
      id: string;
      slug: string;
      snapshot: Omit<Snapshot, "content" | "legacyHtml">;
    }[]
  >`
    SELECT id,slug,("publishedSnapshot" - 'content' - 'legacyHtml') AS snapshot
    FROM articles WHERE "isLive"=true AND "publishedSnapshot" IS NOT NULL
    ORDER BY COALESCE("publishedSnapshot"->>'modifiedAt','') DESC,"createdAt" ASC`;
}
export type PublicFaq = {
  id: string;
  question: string;
  answer: string;
  articleId: string | null;
};
export async function publishedFaqs(articleId: string): Promise<PublicFaq[]> {
  const rows = await db().faq.findMany({
    where: {
      isLive: true,
      OR: [
        { publishedSnapshot: { path: ["articleId"], equals: articleId } },
        { articleLinks: { some: { articleId } } },
      ],
    },
    select: { id: true, publishedSnapshot: true },
    orderBy: { publishedAt: "asc" },
  });
  return rows.map((f) => ({
    id: f.id,
    ...(f.publishedSnapshot as unknown as Omit<PublicFaq, "id">),
  }));
}
