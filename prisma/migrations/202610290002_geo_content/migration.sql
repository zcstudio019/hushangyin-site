-- CreateEnum
CREATE TYPE "SearchIntent" AS ENUM ('AWARENESS', 'COMPARISON', 'DECISION', 'PREPARATION');

-- CreateEnum
CREATE TYPE "QuestionStatus" AS ENUM ('OPEN', 'PLANNED', 'ANSWERED', 'ARCHIVED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ContentStatus" ADD VALUE 'IN_REVIEW';
ALTER TYPE "ContentStatus" ADD VALUE 'APPROVED';

-- AlterTable
ALTER TABLE "articles" ADD COLUMN     "aiAssisted" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "authorId" TEXT,
ADD COLUMN     "contentFormat" VARCHAR(20) NOT NULL DEFAULT 'MARKDOWN',
ADD COLUMN     "editorId" TEXT,
ADD COLUMN     "isLive" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "publishedSnapshot" JSONB,
ADD COLUMN     "revision" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "sources" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "tags" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "faqs" ADD COLUMN     "articleId" TEXT,
ADD COLUMN     "authorId" TEXT,
ADD COLUMN     "editorId" TEXT,
ADD COLUMN     "isLive" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "publishedAt" TIMESTAMPTZ(3),
ADD COLUMN     "publishedSnapshot" JSONB,
ADD COLUMN     "revision" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "sources" JSONB NOT NULL DEFAULT '[]';

-- AlterTable
ALTER TABLE "leads" ADD COLUMN     "sourceArticleId" TEXT,
ADD COLUMN     "sourceParameters" JSONB;

-- CreateTable
CREATE TABLE "geo_questions" (
    "id" TEXT NOT NULL,
    "question" VARCHAR(300) NOT NULL,
    "category" VARCHAR(80) NOT NULL,
    "keywords" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "intent" "SearchIntent" NOT NULL DEFAULT 'AWARENESS',
    "priority" INTEGER NOT NULL DEFAULT 3,
    "status" "QuestionStatus" NOT NULL DEFAULT 'OPEN',
    "articleId" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "geo_questions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "article_versions" (
    "id" TEXT NOT NULL,
    "articleId" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "snapshot" JSONB NOT NULL,
    "editorId" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "article_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "article_relations" (
    "fromId" TEXT NOT NULL,
    "toId" TEXT NOT NULL,

    CONSTRAINT "article_relations_pkey" PRIMARY KEY ("fromId","toId")
);

-- CreateTable
CREATE TABLE "content_reviews" (
    "id" TEXT NOT NULL,
    "articleId" TEXT,
    "faqId" TEXT,
    "revision" INTEGER NOT NULL,
    "reviewerId" TEXT NOT NULL,
    "decision" VARCHAR(20) NOT NULL,
    "checklist" JSONB NOT NULL,
    "note" VARCHAR(1000) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "content_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "geo_questions_question_key" ON "geo_questions"("question");

-- CreateIndex
CREATE INDEX "geo_questions_status_priority_idx" ON "geo_questions"("status", "priority");

-- CreateIndex
CREATE INDEX "geo_questions_category_intent_idx" ON "geo_questions"("category", "intent");

-- CreateIndex
CREATE INDEX "geo_questions_articleId_idx" ON "geo_questions"("articleId");

-- CreateIndex
CREATE UNIQUE INDEX "article_versions_articleId_revision_key" ON "article_versions"("articleId", "revision");

-- CreateIndex
CREATE INDEX "article_relations_toId_idx" ON "article_relations"("toId");

-- CreateIndex
CREATE INDEX "content_reviews_reviewerId_createdAt_idx" ON "content_reviews"("reviewerId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "content_reviews_articleId_revision_key" ON "content_reviews"("articleId", "revision");

-- CreateIndex
CREATE UNIQUE INDEX "content_reviews_faqId_revision_key" ON "content_reviews"("faqId", "revision");

-- CreateIndex
CREATE INDEX "articles_isLive_publishedAt_idx" ON "articles"("isLive", "publishedAt");

-- CreateIndex
CREATE INDEX "articles_category_status_idx" ON "articles"("category", "status");

-- CreateIndex
CREATE INDEX "articles_authorId_idx" ON "articles"("authorId");

-- CreateIndex
CREATE INDEX "faqs_articleId_isLive_idx" ON "faqs"("articleId", "isLive");

-- CreateIndex
CREATE INDEX "leads_sourceArticleId_createdAt_idx" ON "leads"("sourceArticleId", "createdAt");

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_sourceArticleId_fkey" FOREIGN KEY ("sourceArticleId") REFERENCES "articles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "articles" ADD CONSTRAINT "articles_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "articles" ADD CONSTRAINT "articles_editorId_fkey" FOREIGN KEY ("editorId") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "faqs" ADD CONSTRAINT "faqs_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "articles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "faqs" ADD CONSTRAINT "faqs_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "faqs" ADD CONSTRAINT "faqs_editorId_fkey" FOREIGN KEY ("editorId") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "geo_questions" ADD CONSTRAINT "geo_questions_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "articles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "article_versions" ADD CONSTRAINT "article_versions_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "articles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "article_versions" ADD CONSTRAINT "article_versions_editorId_fkey" FOREIGN KEY ("editorId") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "article_relations" ADD CONSTRAINT "article_relations_fromId_fkey" FOREIGN KEY ("fromId") REFERENCES "articles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "article_relations" ADD CONSTRAINT "article_relations_toId_fkey" FOREIGN KEY ("toId") REFERENCES "articles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_reviews" ADD CONSTRAINT "content_reviews_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "articles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_reviews" ADD CONSTRAINT "content_reviews_faqId_fkey" FOREIGN KEY ("faqId") REFERENCES "faqs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_reviews" ADD CONSTRAINT "content_reviews_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "admin_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "content_reviews" ADD CONSTRAINT "content_reviews_one_resource" CHECK (("articleId" IS NOT NULL)::integer + ("faqId" IS NOT NULL)::integer = 1);
ALTER TABLE "geo_questions" ADD CONSTRAINT "geo_questions_priority_range" CHECK (priority BETWEEN 1 AND 5);
ALTER TABLE "article_relations" ADD CONSTRAINT "article_relations_not_self" CHECK ("fromId" <> "toId");
