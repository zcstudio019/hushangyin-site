import { databaseProvider } from "@/lib/db/provider";
import "server-only";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { categories } from "./config";
import type { Snapshot } from "./validation";
export type FaqSnapshot = {
  question: string;
  answer: string;
  category: string;
  articleId: string | null;
  sources: Snapshot["sources"];
  authorName?: string | null;
  publishedAt?: string;
  modifiedAt?: string;
};
export const faqPath = (id: string) => "/faqs/" + encodeURIComponent(id) + "/";
export function faqDescription(answer: string) {
  return answer
    .replace(/!?(\[([^\]]+)\])\([^)]*\)/g, "$2")
    .replace(/[#*`>|]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 180);
}
const live = Prisma.sql`f."isLive"=true AND f."publishedSnapshot" IS NOT NULL AND f."publishedRevision" IS NOT NULL AND EXISTS (SELECT 1 FROM content_reviews r WHERE r."faqId"=f.id AND r.revision=f."publishedRevision" AND r.decision='APPROVED')`;
export async function publicFaq(id: string) {
  if (!/^[a-z0-9_-]{1,64}$/i.test(id)) return null;
  if (databaseProvider() !== "postgresql")
    return (await portableFaqs()).find((f) => f.id === id) || null;
  const rows = await db().$queryRaw<
    { id: string; snapshot: FaqSnapshot }[]
  >`SELECT f.id,f."publishedSnapshot" AS snapshot FROM faqs f WHERE ${live} AND f.id=${id} LIMIT 1`;
  return rows[0] || null;
}
export async function publicFaqs(
  query: { category?: string; page?: string } = {},
) {
  const page = Math.max(
    1,
    Math.min(1000, Number.parseInt(query.page || "1") || 1),
  );
  const category = categories.includes(
    query.category as (typeof categories)[number],
  )
    ? query.category
    : "";
  if (databaseProvider() !== "postgresql") {
    const rows = (await portableFaqs()).filter(
      (f) => !category || f.snapshot.category === category,
    );
    return {
      items: rows.slice((page - 1) * 20, page * 20),
      total: rows.length,
      page,
      category,
    };
  }
  const filter = category
    ? Prisma.sql`AND f."publishedSnapshot"->>'category'=${category}`
    : Prisma.empty;
  const [rows, count] = await db().$transaction([
    db().$queryRaw<
      { id: string; snapshot: FaqSnapshot }[]
    >`SELECT f.id,f."publishedSnapshot" AS snapshot FROM faqs f WHERE ${live} ${filter} ORDER BY f."publishedAt" DESC,f.id LIMIT 20 OFFSET ${(page - 1) * 20}`,
    db().$queryRaw<
      { total: bigint }[]
    >`SELECT COUNT(*) AS total FROM faqs f WHERE ${live} ${filter}`,
  ]);
  return { items: rows, total: Number(count[0].total), page, category };
}
export async function publicFaqUrls() {
  if (databaseProvider() !== "postgresql")
    return (await portableFaqs()).map((f) => ({
      id: f.id,
      modifiedAt: f.snapshot.modifiedAt || null,
    }));
  return db().$queryRaw<
    { id: string; modifiedAt: string | null }[]
  >`SELECT f.id,f."publishedSnapshot"->>'modifiedAt' AS "modifiedAt" FROM faqs f WHERE ${live} ORDER BY f.id`;
}

async function portableFaqs() {
  const rows = await db().faq.findMany({
    where: { isLive: true, publishedRevision: { not: null } },
    select: {
      id: true,
      publishedSnapshot: true,
      publishedRevision: true,
      reviews: { where: { decision: "APPROVED" }, select: { revision: true } },
    },
    orderBy: [{ publishedAt: "desc" }, { id: "asc" }],
  });
  return rows
    .filter(
      (f) =>
        f.publishedSnapshot &&
        f.reviews.some((r) => r.revision === f.publishedRevision),
    )
    .map((f) => ({
      id: f.id,
      snapshot: f.publishedSnapshot as unknown as FaqSnapshot,
    }));
}
