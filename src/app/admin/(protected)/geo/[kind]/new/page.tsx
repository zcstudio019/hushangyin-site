import { notFound } from "next/navigation";
import { pageActor } from "@/lib/auth/page";
import { db } from "@/lib/db";
import { kindOf } from "@/features/geo/service";
import { ContentEditor } from "@/components/forms/GeoForms";
export const metadata = { title: "新增内容" };
export default async function NewContent({
  params,
  searchParams,
}: {
  params: Promise<{ kind: string }>;
  searchParams: Promise<{ questionId?: string }>;
}) {
  await pageActor("content.create");
  const kind = kindOf((await params).kind);
  const questionId = (await searchParams).questionId;
  const question =
    kind === "articles" && questionId
      ? await db().geoQuestion.findFirst({
          where: { id: questionId.slice(0, 64), status: { not: "ARCHIVED" } },
        })
      : null;
  if (questionId && !question) notFound();
  return (
    <>
      <h1>
        新增
        {kind === "articles" ? "文章" : kind === "faqs" ? "问答" : "融资问题"}
      </h1>
      <ContentEditor
        kind={kind}
        item={
          question
            ? {
                questionId: question.id,
                title: question.question,
                category: question.category,
                tags: question.keywords,
              }
            : undefined
        }
        articles={await db().article.findMany({
          select: { id: true, title: true },
          orderBy: { title: "asc" },
        })}
      />
    </>
  );
}
