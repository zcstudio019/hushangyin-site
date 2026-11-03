-- CreateEnum
CREATE TYPE "GenerationStatus" AS ENUM ('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELLED');

-- AlterTable
ALTER TABLE "articles" ADD COLUMN     "complianceReport" JSONB,
ADD COLUMN     "generationMetadata" JSONB,
ADD COLUMN     "metaDescription" VARCHAR(600),
ADD COLUMN     "publishedRevision" INTEGER,
ADD COLUMN     "seoTitle" VARCHAR(200);

-- AlterTable
ALTER TABLE "faqs" ADD COLUMN     "publishedRevision" INTEGER;

-- CreateTable
CREATE TABLE "geo_generation_templates" (
    "id" TEXT NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "description" VARCHAR(600) NOT NULL,
    "templateContent" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "updatedById" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "geo_generation_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "geo_generation_tasks" (
    "id" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "creatorSessionVersion" INTEGER NOT NULL,
    "status" "GenerationStatus" NOT NULL DEFAULT 'QUEUED',
    "articleType" VARCHAR(60) NOT NULL,
    "audience" VARCHAR(120) NOT NULL,
    "depth" VARCHAR(30) NOT NULL,
    "templateId" TEXT NOT NULL,
    "templateVersion" INTEGER NOT NULL,
    "providerName" VARCHAR(60) NOT NULL,
    "modelName" VARCHAR(100) NOT NULL,
    "inputSnapshot" JSONB NOT NULL,
    "output" JSONB,
    "outputArticleId" TEXT,
    "idempotencyKey" VARCHAR(80) NOT NULL,
    "activeKey" VARCHAR(64),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 3,
    "timeoutMs" INTEGER NOT NULL DEFAULT 90000,
    "maxOutputTokens" INTEGER NOT NULL DEFAULT 4000,
    "leaseToken" VARCHAR(64),
    "leaseUntil" TIMESTAMPTZ(3),
    "availableAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "errorCode" VARCHAR(60),
    "errorMessage" VARCHAR(400),
    "tokenUsage" JSONB,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMPTZ(3),
    "completedAt" TIMESTAMPTZ(3),
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "geo_generation_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "generation_call_logs" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "attempt" INTEGER NOT NULL,
    "provider" VARCHAR(60) NOT NULL,
    "model" VARCHAR(100) NOT NULL,
    "requestId" VARCHAR(120),
    "status" VARCHAR(40) NOT NULL,
    "errorCode" VARCHAR(60),
    "usage" JSONB,
    "estimatedCostUsd" DECIMAL(12,6),
    "startedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMPTZ(3),

    CONSTRAINT "generation_call_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "generation_worker_heartbeats" (
    "id" VARCHAR(80) NOT NULL,
    "lastSeenAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "generation_worker_heartbeats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "article_question_relations" (
    "articleId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "relationType" VARCHAR(20) NOT NULL DEFAULT 'RELATED',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "article_question_relations_pkey" PRIMARY KEY ("articleId","questionId")
);

-- CreateTable
CREATE TABLE "article_faq_relations" (
    "articleId" TEXT NOT NULL,
    "faqId" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "evidenceMode" VARCHAR(20) NOT NULL,

    CONSTRAINT "article_faq_relations_pkey" PRIMARY KEY ("articleId","faqId")
);

-- CreateTable
CREATE TABLE "article_sources" (
    "id" TEXT NOT NULL,
    "articleId" TEXT,
    "catalogId" TEXT,
    "title" VARCHAR(200) NOT NULL,
    "sourceUrl" VARCHAR(1000) NOT NULL,
    "sourceType" VARCHAR(30) NOT NULL DEFAULT 'REFERENCE',
    "excerpt" VARCHAR(4000) NOT NULL,
    "paragraph" VARCHAR(2000),
    "verifiedAt" TIMESTAMPTZ(3),
    "validUntil" TIMESTAMPTZ(3),
    "verifiedById" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "revision" INTEGER,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "article_sources_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "geo_generation_templates_name_key" ON "geo_generation_templates"("name");

-- CreateIndex
CREATE UNIQUE INDEX "geo_generation_tasks_outputArticleId_key" ON "geo_generation_tasks"("outputArticleId");

-- CreateIndex
CREATE UNIQUE INDEX "geo_generation_tasks_activeKey_key" ON "geo_generation_tasks"("activeKey");

-- CreateIndex
CREATE INDEX "geo_generation_tasks_status_availableAt_idx" ON "geo_generation_tasks"("status", "availableAt");

-- CreateIndex
CREATE INDEX "geo_generation_tasks_createdById_createdAt_idx" ON "geo_generation_tasks"("createdById", "createdAt");

-- CreateIndex
CREATE INDEX "geo_generation_tasks_questionId_idx" ON "geo_generation_tasks"("questionId");

-- CreateIndex
CREATE INDEX "geo_generation_tasks_leaseUntil_idx" ON "geo_generation_tasks"("leaseUntil");

-- CreateIndex
CREATE UNIQUE INDEX "geo_generation_tasks_createdById_idempotencyKey_key" ON "geo_generation_tasks"("createdById", "idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "generation_call_logs_taskId_attempt_key" ON "generation_call_logs"("taskId", "attempt");

-- CreateIndex
CREATE INDEX "article_question_relations_questionId_idx" ON "article_question_relations"("questionId");

-- CreateIndex
CREATE INDEX "article_faq_relations_faqId_idx" ON "article_faq_relations"("faqId");

-- CreateIndex
CREATE INDEX "article_sources_articleId_revision_idx" ON "article_sources"("articleId", "revision");

-- CreateIndex
CREATE INDEX "article_sources_catalogId_idx" ON "article_sources"("catalogId");

-- CreateIndex
CREATE INDEX "article_sources_isActive_verifiedAt_idx" ON "article_sources"("isActive", "verifiedAt");

-- AddForeignKey
ALTER TABLE "geo_generation_templates" ADD CONSTRAINT "geo_generation_templates_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "geo_generation_tasks" ADD CONSTRAINT "geo_generation_tasks_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "geo_questions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "geo_generation_tasks" ADD CONSTRAINT "geo_generation_tasks_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "admin_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "geo_generation_tasks" ADD CONSTRAINT "geo_generation_tasks_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "geo_generation_templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "geo_generation_tasks" ADD CONSTRAINT "geo_generation_tasks_outputArticleId_fkey" FOREIGN KEY ("outputArticleId") REFERENCES "articles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "generation_call_logs" ADD CONSTRAINT "generation_call_logs_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "geo_generation_tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "article_question_relations" ADD CONSTRAINT "article_question_relations_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "articles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "article_question_relations" ADD CONSTRAINT "article_question_relations_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "geo_questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "article_faq_relations" ADD CONSTRAINT "article_faq_relations_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "articles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "article_faq_relations" ADD CONSTRAINT "article_faq_relations_faqId_fkey" FOREIGN KEY ("faqId") REFERENCES "faqs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "article_sources" ADD CONSTRAINT "article_sources_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "articles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "article_sources" ADD CONSTRAINT "article_sources_catalogId_fkey" FOREIGN KEY ("catalogId") REFERENCES "article_sources"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "article_sources" ADD CONSTRAINT "article_sources_verifiedById_fkey" FOREIGN KEY ("verifiedById") REFERENCES "admin_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Preserve historical single-article links; do not invent review records.
INSERT INTO article_question_relations ("articleId","questionId","relationType")
SELECT "articleId",id,'PRIMARY' FROM geo_questions WHERE "articleId" IS NOT NULL ON CONFLICT DO NOTHING;
UPDATE articles a SET "publishedRevision" = a.revision WHERE a."isLive" AND a.status='PUBLISHED'
AND EXISTS (SELECT 1 FROM content_reviews r WHERE r."articleId"=a.id AND r.revision=a.revision AND r.decision='APPROVED');
UPDATE faqs f SET "publishedRevision" = f.revision WHERE f."isLive" AND f.status='PUBLISHED'
AND EXISTS (SELECT 1 FROM content_reviews r WHERE r."faqId"=f.id AND r.revision=f.revision AND r.decision='APPROVED');
-- Native full text index; Chinese retrieval additionally uses bounded category/keyword matching.
CREATE INDEX geo_questions_search_idx ON geo_questions USING GIN (to_tsvector('simple', question));
CREATE INDEX faqs_search_idx ON faqs USING GIN (to_tsvector('simple', question));
