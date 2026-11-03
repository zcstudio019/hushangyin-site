-- AlterTable
ALTER TABLE "articles" ADD COLUMN     "submittedAt" TIMESTAMPTZ(3),
ADD COLUMN     "submittedById" TEXT;

-- AlterTable
ALTER TABLE "faqs" ADD COLUMN     "submittedAt" TIMESTAMPTZ(3),
ADD COLUMN     "submittedById" TEXT;

-- CreateTable
CREATE TABLE "faq_versions" (
    "id" TEXT NOT NULL,
    "faqId" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "snapshot" JSONB NOT NULL,
    "editorId" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "faq_versions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "faq_versions_faqId_revision_key" ON "faq_versions"("faqId", "revision");

-- CreateIndex
CREATE INDEX "articles_status_submittedAt_idx" ON "articles"("status", "submittedAt");

-- CreateIndex
CREATE INDEX "faqs_status_submittedAt_idx" ON "faqs"("status", "submittedAt");

-- AddForeignKey
ALTER TABLE "articles" ADD CONSTRAINT "articles_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "faqs" ADD CONSTRAINT "faqs_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "faq_versions" ADD CONSTRAINT "faq_versions_faqId_fkey" FOREIGN KEY ("faqId") REFERENCES "faqs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "faq_versions" ADD CONSTRAINT "faq_versions_editorId_fkey" FOREIGN KEY ("editorId") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Capture the existing current FAQ revision without fabricating earlier history or changing answers.
INSERT INTO faq_versions (id,"faqId",revision,snapshot,"editorId")
SELECT 'baseline-'||id,id,revision,jsonb_build_object('question',question,'answer',answer,'category',category,'articleId',"articleId",'sources',sources),"editorId"
FROM faqs ON CONFLICT ("faqId",revision) DO NOTHING;
