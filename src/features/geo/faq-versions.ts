import { Prisma, type Faq } from "@prisma/client";
export async function saveFaqVersion(
  tx: Prisma.TransactionClient,
  faq: Faq,
  editorId?: string,
) {
  return tx.faqVersion.upsert({
    where: { faqId_revision: { faqId: faq.id, revision: faq.revision } },
    create: {
      faqId: faq.id,
      revision: faq.revision,
      editorId: editorId || faq.editorId,
      snapshot: {
        question: faq.question,
        answer: faq.answer,
        category: faq.category,
        articleId: faq.articleId,
        sources: faq.sources,
      },
    },
    update: {},
  });
}
