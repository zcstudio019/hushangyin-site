import { notFound } from "next/navigation";
import { pageActor } from "@/lib/auth/page";
import { db } from "@/lib/db";
import { PublicArticleContent } from "@/components/content/PublicContent";
import { SafeMarkdown } from "@/components/content/SafeMarkdown";
import type { Snapshot } from "@/features/geo/validation";
export const metadata = {
  title: "内部内容预览",
  robots: { index: false, follow: false },
};
export default async function Preview({
  params,
  searchParams,
}: {
  params: Promise<{ kind: string; id: string }>;
  searchParams: Promise<{ version?: string }>;
}) {
  await pageActor("content.read");
  const { kind, id } = await params;
  const selected = (await searchParams).version;
  const version =
    selected && /^\d{1,9}$/.test(selected) ? Number(selected) : undefined;
  if (selected && version === undefined) notFound();
  if (version !== undefined) {
    if (kind === "faqs") {
      const old = await db().faqVersion.findUnique({
        where: { faqId_revision: { faqId: id, revision: version } },
      });
      if (!old) notFound();
      const s = old.snapshot as {
        question: string;
        answer: string;
        sources: Snapshot["sources"];
      };
      return (
        <>
          <p>内部历史快照：版本{version}，不是公开版本。</p>
          <h1>{s.question}</h1>
          <SafeMarkdown content={s.answer} />
          <h2>历史来源</h2>
          <ul>
            {s.sources.map((r, i) => (
              <li key={i}>
                {r.title} · {r.url} · {r.checkedAt || "未记录"}
              </li>
            ))}
          </ul>
        </>
      );
    }
    if (kind === "articles") {
      const old = await db().articleVersion.findUnique({
        where: { articleId_revision: { articleId: id, revision: version } },
      });
      if (!old) notFound();
      const s = old.snapshot as unknown as Snapshot;
      return (
        <>
          <p>内部历史快照：版本{version}，不是公开版本。</p>
          <PublicArticleContent
            article={{ id, slug: s.slug, snapshot: s }}
            preview
          />
        </>
      );
    }
    notFound();
  }
  if (kind === "articles") {
    const a = await db().article.findUnique({
      where: { id },
      include: {
        author: { select: { name: true } },
        relatedFrom: { select: { toId: true } },
      },
    });
    if (!a) notFound();
    const snapshot: Snapshot = {
      title: a.title,
      slug: a.slug,
      summary: a.summary,
      content: a.content,
      category: a.category,
      tags: a.tags,
      sources: a.sources as unknown as Snapshot["sources"],
      contentFormat: "MARKDOWN",
      authorName: a.author?.name || null,
      relatedIds: a.relatedFrom.map((r) => r.toId),
      aiAssisted: a.aiAssisted,
    };
    return (
      <PublicArticleContent
        article={{ id: a.id, slug: a.slug, snapshot }}
        preview
      />
    );
  }
  if (kind === "faqs") {
    const f = await db().faq.findUnique({ where: { id } });
    if (!f) notFound();
    return (
      <>
        <p>内部问答草稿预览，尚未公开。</p>
        <h1>{f.question}</h1>
        <SafeMarkdown content={f.answer} />
      </>
    );
  }
  notFound();
}
