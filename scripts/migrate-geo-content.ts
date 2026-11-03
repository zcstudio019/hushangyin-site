import {createDatabaseClient} from "../src/lib/db/provider";
import { Prisma } from "@prisma/client";
import pages from "../src/features/content/legacy-pages.json";
import { articleSources } from "../src/features/content/sources";
const p = createDatabaseClient();
function markdown(html: string) {
  return html
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, "")
    .replace(
      /<h([1-3])\b[^>]*>([\s\S]*?)<\/h\1>/gi,
      (_, n, c) => "\n" + "#".repeat(Number(n)) + " " + c + "\n",
    )
    .replace(/<li\b[^>]*>/gi, "\n- ")
    .replace(/<\/(?:p|section|div|ul|ol|table|tr|blockquote)>/gi, "\n\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
async function main() {
  let count = 0;
  await p.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(151151)`;
    for (const [path, page] of Object.entries(pages)) {
      if (!path.startsWith("/insights/") || path === "/insights/") continue;
      const slug = path.split("/")[2];
      const old = await tx.article.findUnique({ where: { slug } });
      if (old?.isLive) continue;
      if (old && (old.revision > 0 || old.content !== page.html))
        throw Error("EXISTING_CONTENT_CONFLICT");
      const content = markdown(page.html),
        snapshot = {
          title: page.title,
          slug,
          summary: page.description,
          content,
          legacyHtml: page.html,
          contentFormat: "LEGACY_HTML",
          category: "融资知识",
          tags: [],
          sources: (articleSources[path] || []).map((s) => ({
            title: s.title,
            url: s.href,
          })),
          authorName: null,
          publishedAt: null,
          relatedIds: [],
          aiAssisted: false,
        };
      const data = {
        title: page.title,
        summary: page.description,
        content,
        category: "融资知识",
        contentFormat: "MARKDOWN",
        status: "PUBLISHED" as const,
        isLive: true,
        revision: 1,
        publishedSnapshot: snapshot as Prisma.InputJsonValue,
      };
      const a = old
        ? await tx.article.update({ where: { id: old.id }, data })
        : await tx.article.create({ data: { ...data, slug } });
      await tx.articleVersion.create({
        data: {
          articleId: a.id,
          revision: 1,
          snapshot: snapshot as Prisma.InputJsonValue,
        },
      });
      await tx.auditLog.create({
        data: {
          action: "CONTENT_LEGACY_PRESERVE",
          resourceType: "geo_articles",
          resourceId: a.id,
          metadata: { source: "controlled_repository", originalPath: path },
        },
      });
      count++;
    }
  });
  console.log(
    "Preserved " +
      count +
      " existing public articles; no new financial material published.",
  );
}
main()
  .catch(() => {
    console.error(
      "Legacy content migration failed safely; check conflicts. No credentials or content logged.",
    );
    process.exitCode = 1;
  })
  .finally(() => p.$disconnect());
