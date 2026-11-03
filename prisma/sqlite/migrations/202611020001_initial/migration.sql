-- CreateTable
CREATE TABLE "customers" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "customerType" TEXT NOT NULL,
    "companyName" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "leads" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "customerId" TEXT,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "customerType" TEXT NOT NULL,
    "financingAmount" TEXT NOT NULL,
    "hasProperty" BOOLEAN,
    "hasCompany" BOOLEAN,
    "remark" TEXT,
    "source" TEXT NOT NULL DEFAULT 'website',
    "sourcePage" TEXT NOT NULL,
    "sourceArticleId" TEXT,
    "sourceParameters" JSONB,
    "status" TEXT NOT NULL DEFAULT 'NEW',
    "assignedTo" TEXT,
    "departmentId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "leads_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "leads_sourceArticleId_fkey" FOREIGN KEY ("sourceArticleId") REFERENCES "articles" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "leads_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "leads_assignedTo_fkey" FOREIGN KEY ("assignedTo") REFERENCES "admin_users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "admin_users" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'FINANCING_ADVISOR',
    "departmentId" TEXT,
    "mustChangePassword" BOOLEAN NOT NULL DEFAULT false,
    "sessionVersion" INTEGER NOT NULL DEFAULT 0,
    "initialCredentialExpiresAt" DATETIME,
    "lastLoginAt" DATETIME,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "admin_users_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "departments" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "resourceType" TEXT NOT NULL,
    "resourceId" TEXT,
    "metadata" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "audit_logs_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "admin_users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "consents" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "leadId" TEXT,
    "customerId" TEXT,
    "consentType" TEXT NOT NULL,
    "policyVersion" TEXT NOT NULL,
    "agreedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "evidenceReference" TEXT NOT NULL,
    CONSTRAINT "consents_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "leads" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "consents_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "articles" (
    "reviewAssigneeId" TEXT,
    "reviewAssignedRevision" INTEGER,
    "reviewAssignedAt" DATETIME,
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "publishedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "tags" JSONB NOT NULL DEFAULT [],
    "sources" JSONB NOT NULL DEFAULT [],
    "contentFormat" TEXT NOT NULL DEFAULT 'MARKDOWN',
    "authorId" TEXT,
    "editorId" TEXT,
    "aiAssisted" BOOLEAN NOT NULL DEFAULT false,
    "revision" INTEGER NOT NULL DEFAULT 0,
    "isLive" BOOLEAN NOT NULL DEFAULT false,
    "publishedSnapshot" JSONB,
    "publishedRevision" INTEGER,
    "submittedAt" DATETIME,
    "submittedById" TEXT,
    "seoTitle" TEXT,
    "metaDescription" TEXT,
    "generationMetadata" JSONB,
    "complianceReport" JSONB,
    CONSTRAINT "articles_reviewAssigneeId_fkey" FOREIGN KEY ("reviewAssigneeId") REFERENCES "admin_users" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "articles_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "admin_users" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "articles_editorId_fkey" FOREIGN KEY ("editorId") REFERENCES "admin_users" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "articles_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "admin_users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "faqs" (
    "reviewAssigneeId" TEXT,
    "reviewAssignedRevision" INTEGER,
    "reviewAssignedAt" DATETIME,
    "id" TEXT NOT NULL PRIMARY KEY,
    "question" TEXT NOT NULL,
    "importMetadata" JSONB,
    "answer" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "articleId" TEXT,
    "sources" JSONB NOT NULL DEFAULT [],
    "authorId" TEXT,
    "editorId" TEXT,
    "revision" INTEGER NOT NULL DEFAULT 0,
    "isLive" BOOLEAN NOT NULL DEFAULT false,
    "publishedAt" DATETIME,
    "publishedSnapshot" JSONB,
    "publishedRevision" INTEGER,
    "submittedAt" DATETIME,
    "submittedById" TEXT,
    CONSTRAINT "faqs_reviewAssigneeId_fkey" FOREIGN KEY ("reviewAssigneeId") REFERENCES "admin_users" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "faqs_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "articles" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "faqs_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "admin_users" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "faqs_editorId_fkey" FOREIGN KEY ("editorId") REFERENCES "admin_users" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "faqs_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "admin_users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "geo_questions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "question" TEXT NOT NULL,
    "importMetadata" JSONB,
    "category" TEXT NOT NULL,
    "keywords" JSONB NOT NULL DEFAULT [],
    "intent" TEXT NOT NULL DEFAULT 'AWARENESS',
    "priority" INTEGER NOT NULL DEFAULT 3,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "articleId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "geo_questions_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "articles" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "geo_generation_templates" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "templateContent" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "updatedById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "geo_generation_templates_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "admin_users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "geo_generation_tasks" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "questionId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "creatorSessionVersion" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "articleType" TEXT NOT NULL,
    "audience" TEXT NOT NULL,
    "depth" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "templateVersion" INTEGER NOT NULL,
    "providerName" TEXT NOT NULL,
    "modelName" TEXT NOT NULL,
    "inputSnapshot" JSONB NOT NULL,
    "output" JSONB,
    "outputArticleId" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "activeKey" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 3,
    "timeoutMs" INTEGER NOT NULL DEFAULT 90000,
    "maxOutputTokens" INTEGER NOT NULL DEFAULT 4000,
    "leaseToken" TEXT,
    "leaseUntil" DATETIME,
    "availableAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "tokenUsage" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" DATETIME,
    "completedAt" DATETIME,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "geo_generation_tasks_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "geo_questions" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "geo_generation_tasks_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "admin_users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "geo_generation_tasks_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "geo_generation_templates" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "geo_generation_tasks_outputArticleId_fkey" FOREIGN KEY ("outputArticleId") REFERENCES "articles" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "generation_call_logs" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "taskId" TEXT NOT NULL,
    "attempt" INTEGER NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "requestId" TEXT,
    "status" TEXT NOT NULL,
    "errorCode" TEXT,
    "usage" JSONB,
    "estimatedCostUsd" DECIMAL,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" DATETIME,
    CONSTRAINT "generation_call_logs_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "geo_generation_tasks" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "generation_worker_heartbeats" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "lastSeenAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "article_question_relations" (
    "articleId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "relationType" TEXT NOT NULL DEFAULT 'RELATED',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY ("articleId", "questionId"),
    CONSTRAINT "article_question_relations_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "articles" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "article_question_relations_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "geo_questions" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "article_faq_relations" (
    "articleId" TEXT NOT NULL,
    "faqId" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "evidenceMode" TEXT NOT NULL,

    PRIMARY KEY ("articleId", "faqId"),
    CONSTRAINT "article_faq_relations_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "articles" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "article_faq_relations_faqId_fkey" FOREIGN KEY ("faqId") REFERENCES "faqs" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "article_sources" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "articleId" TEXT,
    "catalogId" TEXT,
    "title" TEXT NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL DEFAULT 'REFERENCE',
    "excerpt" TEXT NOT NULL,
    "paragraph" TEXT,
    "verifiedAt" DATETIME,
    "validUntil" DATETIME,
    "verifiedById" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "revision" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "article_sources_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "articles" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "article_sources_catalogId_fkey" FOREIGN KEY ("catalogId") REFERENCES "article_sources" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "article_sources_verifiedById_fkey" FOREIGN KEY ("verifiedById") REFERENCES "admin_users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "article_versions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "articleId" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "snapshot" JSONB NOT NULL,
    "editorId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "article_versions_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "articles" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "article_versions_editorId_fkey" FOREIGN KEY ("editorId") REFERENCES "admin_users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "faq_versions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "faqId" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "snapshot" JSONB NOT NULL,
    "editorId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "faq_versions_faqId_fkey" FOREIGN KEY ("faqId") REFERENCES "faqs" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "faq_versions_editorId_fkey" FOREIGN KEY ("editorId") REFERENCES "admin_users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "article_relations" (
    "fromId" TEXT NOT NULL,
    "toId" TEXT NOT NULL,

    PRIMARY KEY ("fromId", "toId"),
    CONSTRAINT "article_relations_fromId_fkey" FOREIGN KEY ("fromId") REFERENCES "articles" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "article_relations_toId_fkey" FOREIGN KEY ("toId") REFERENCES "articles" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "content_reviews" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "articleId" TEXT,
    "faqId" TEXT,
    "revision" INTEGER NOT NULL,
    "reviewerId" TEXT NOT NULL,
    "decision" TEXT NOT NULL,
    "checklist" JSONB NOT NULL,
    "note" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "content_reviews_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "articles" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "content_reviews_faqId_fkey" FOREIGN KEY ("faqId") REFERENCES "faqs" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "content_reviews_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "admin_users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "loan_products" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "targetCustomer" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "requirements" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "admin_sessions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tokenHash" TEXT NOT NULL,
    "adminId" TEXT NOT NULL,
    "sessionVersion" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "admin_sessions_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "admin_users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "rate_limit_buckets" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "count" INTEGER NOT NULL DEFAULT 1,
    "expiresAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "submission_guards" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "expiresAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "content_events" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "dedupeKey" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "articleId" TEXT,
    "faqId" TEXT,
    "contentKey" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "sessionKey" TEXT NOT NULL,
    "policyVersion" TEXT NOT NULL,
    "day" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "content_events_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "articles" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "content_events_faqId_fkey" FOREIGN KEY ("faqId") REFERENCES "faqs" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "content_daily_metrics" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "day" DATETIME NOT NULL,
    "contentKey" TEXT NOT NULL,
    "articleId" TEXT,
    "faqId" TEXT,
    "path" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "pv" INTEGER NOT NULL DEFAULT 0,
    "visits" INTEGER NOT NULL DEFAULT 0,
    "clicks" INTEGER NOT NULL DEFAULT 0,
    "measuredConsultations" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "content_daily_metrics_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "articles" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "content_daily_metrics_faqId_fkey" FOREIGN KEY ("faqId") REFERENCES "faqs" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "lead_attributions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "leadId" TEXT NOT NULL,
    "articleId" TEXT,
    "faqId" TEXT,
    "sourceType" TEXT NOT NULL,
    "contentTitle" TEXT,
    "path" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "confidence" TEXT NOT NULL,
    "utmSource" TEXT,
    "utmMedium" TEXT,
    "utmCampaign" TEXT,
    "sessionKey" TEXT,
    "measured" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "lead_attributions_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "leads" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "lead_attributions_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "articles" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "lead_attributions_faqId_fkey" FOREIGN KEY ("faqId") REFERENCES "faqs" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "search_platform_connections" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "platform" TEXT NOT NULL,
    "siteUrl" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "mode" TEXT NOT NULL DEFAULT 'CSV_ONLY',
    "createdById" TEXT,
    "lastImportedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "search_platform_connections_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "admin_users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "search_performance_metrics" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "connectionId" TEXT NOT NULL,
    "day" DATETIME NOT NULL,
    "dimension" TEXT NOT NULL DEFAULT 'site-daily-web',
    "clicks" INTEGER NOT NULL,
    "impressions" INTEGER NOT NULL,
    "averagePosition" REAL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "search_performance_metrics_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "search_platform_connections" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "geo_visibility_observations" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "platform" TEXT NOT NULL,
    "query" TEXT NOT NULL,
    "observedOn" DATETIME NOT NULL,
    "brandMention" BOOLEAN NOT NULL,
    "siteCitation" BOOLEAN NOT NULL,
    "recommendation" BOOLEAN NOT NULL,
    "articleId" TEXT,
    "evidenceUrl" TEXT NOT NULL,
    "evidenceNote" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "geo_visibility_observations_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "articles" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "geo_visibility_observations_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "admin_users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "analytics_sync_jobs" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "connectionId" TEXT NOT NULL,
    "actorId" TEXT,
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "inputHash" TEXT,
    "result" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" DATETIME,
    CONSTRAINT "analytics_sync_jobs_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "search_platform_connections" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "analytics_sync_jobs_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "admin_users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "deployment_write_lock" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "epoch" INTEGER NOT NULL DEFAULT 0
);

-- CreateIndex
CREATE INDEX "customers_phone_idx" ON "customers"("phone");

-- CreateIndex
CREATE INDEX "leads_status_createdAt_idx" ON "leads"("status", "createdAt");

-- CreateIndex
CREATE INDEX "leads_assignedTo_createdAt_idx" ON "leads"("assignedTo", "createdAt");

-- CreateIndex
CREATE INDEX "leads_departmentId_createdAt_idx" ON "leads"("departmentId", "createdAt");

-- CreateIndex
CREATE INDEX "leads_customerId_idx" ON "leads"("customerId");

-- CreateIndex
CREATE INDEX "leads_phone_idx" ON "leads"("phone");

-- CreateIndex
CREATE INDEX "leads_updatedAt_idx" ON "leads"("updatedAt");

-- CreateIndex
CREATE INDEX "leads_sourceArticleId_createdAt_idx" ON "leads"("sourceArticleId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "admin_users_email_key" ON "admin_users"("email");

-- CreateIndex
CREATE INDEX "admin_users_departmentId_role_isActive_idx" ON "admin_users"("departmentId", "role", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "departments_name_key" ON "departments"("name");

-- CreateIndex
CREATE INDEX "audit_logs_actorId_createdAt_idx" ON "audit_logs"("actorId", "createdAt");

-- CreateIndex
CREATE INDEX "audit_logs_resourceType_resourceId_idx" ON "audit_logs"("resourceType", "resourceId");

-- CreateIndex
CREATE INDEX "audit_logs_createdAt_idx" ON "audit_logs"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "consents_evidenceReference_key" ON "consents"("evidenceReference");

-- CreateIndex
CREATE INDEX "consents_leadId_idx" ON "consents"("leadId");

-- CreateIndex
CREATE INDEX "consents_customerId_idx" ON "consents"("customerId");

-- CreateIndex
CREATE INDEX "consents_agreedAt_idx" ON "consents"("agreedAt");

-- CreateIndex
CREATE UNIQUE INDEX "articles_slug_key" ON "articles"("slug");

-- CreateIndex
CREATE INDEX "articles_status_publishedAt_idx" ON "articles"("status", "publishedAt");

-- CreateIndex
CREATE INDEX "articles_status_submittedAt_idx" ON "articles"("status", "submittedAt");

-- CreateIndex
CREATE INDEX "articles_reviewAssigneeId_status_idx" ON "articles"("reviewAssigneeId", "status");

-- CreateIndex
CREATE INDEX "articles_isLive_publishedAt_idx" ON "articles"("isLive", "publishedAt");

-- CreateIndex
CREATE INDEX "articles_category_status_idx" ON "articles"("category", "status");

-- CreateIndex
CREATE INDEX "articles_authorId_idx" ON "articles"("authorId");

-- CreateIndex
CREATE UNIQUE INDEX "faqs_question_key" ON "faqs"("question");

-- CreateIndex
CREATE INDEX "faqs_status_category_idx" ON "faqs"("status", "category");

-- CreateIndex
CREATE INDEX "faqs_status_submittedAt_idx" ON "faqs"("status", "submittedAt");

-- CreateIndex
CREATE INDEX "faqs_reviewAssigneeId_status_idx" ON "faqs"("reviewAssigneeId", "status");

-- CreateIndex
CREATE INDEX "faqs_articleId_isLive_idx" ON "faqs"("articleId", "isLive");

-- CreateIndex
CREATE UNIQUE INDEX "geo_questions_question_key" ON "geo_questions"("question");

-- CreateIndex
CREATE INDEX "geo_questions_status_priority_idx" ON "geo_questions"("status", "priority");

-- CreateIndex
CREATE INDEX "geo_questions_category_intent_idx" ON "geo_questions"("category", "intent");

-- CreateIndex
CREATE INDEX "geo_questions_articleId_idx" ON "geo_questions"("articleId");

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

-- CreateIndex
CREATE UNIQUE INDEX "article_versions_articleId_revision_key" ON "article_versions"("articleId", "revision");

-- CreateIndex
CREATE UNIQUE INDEX "faq_versions_faqId_revision_key" ON "faq_versions"("faqId", "revision");

-- CreateIndex
CREATE INDEX "article_relations_toId_idx" ON "article_relations"("toId");

-- CreateIndex
CREATE INDEX "content_reviews_reviewerId_createdAt_idx" ON "content_reviews"("reviewerId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "content_reviews_articleId_revision_key" ON "content_reviews"("articleId", "revision");

-- CreateIndex
CREATE UNIQUE INDEX "content_reviews_faqId_revision_key" ON "content_reviews"("faqId", "revision");

-- CreateIndex
CREATE UNIQUE INDEX "loan_products_name_key" ON "loan_products"("name");

-- CreateIndex
CREATE INDEX "loan_products_status_category_idx" ON "loan_products"("status", "category");

-- CreateIndex
CREATE UNIQUE INDEX "admin_sessions_tokenHash_key" ON "admin_sessions"("tokenHash");

-- CreateIndex
CREATE INDEX "admin_sessions_adminId_idx" ON "admin_sessions"("adminId");

-- CreateIndex
CREATE INDEX "admin_sessions_expiresAt_idx" ON "admin_sessions"("expiresAt");

-- CreateIndex
CREATE INDEX "rate_limit_buckets_expiresAt_idx" ON "rate_limit_buckets"("expiresAt");

-- CreateIndex
CREATE INDEX "submission_guards_expiresAt_idx" ON "submission_guards"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "content_events_dedupeKey_key" ON "content_events"("dedupeKey");

-- CreateIndex
CREATE INDEX "content_events_day_contentKey_type_idx" ON "content_events"("day", "contentKey", "type");

-- CreateIndex
CREATE INDEX "content_events_sessionKey_contentKey_type_idx" ON "content_events"("sessionKey", "contentKey", "type");

-- CreateIndex
CREATE INDEX "content_events_createdAt_idx" ON "content_events"("createdAt");

-- CreateIndex
CREATE INDEX "content_daily_metrics_articleId_day_idx" ON "content_daily_metrics"("articleId", "day");

-- CreateIndex
CREATE INDEX "content_daily_metrics_faqId_day_idx" ON "content_daily_metrics"("faqId", "day");

-- CreateIndex
CREATE UNIQUE INDEX "content_daily_metrics_day_contentKey_channel_key" ON "content_daily_metrics"("day", "contentKey", "channel");

-- CreateIndex
CREATE UNIQUE INDEX "lead_attributions_leadId_key" ON "lead_attributions"("leadId");

-- CreateIndex
CREATE INDEX "lead_attributions_articleId_createdAt_idx" ON "lead_attributions"("articleId", "createdAt");

-- CreateIndex
CREATE INDEX "lead_attributions_faqId_createdAt_idx" ON "lead_attributions"("faqId", "createdAt");

-- CreateIndex
CREATE INDEX "lead_attributions_channel_createdAt_idx" ON "lead_attributions"("channel", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "search_platform_connections_platform_siteUrl_key" ON "search_platform_connections"("platform", "siteUrl");

-- CreateIndex
CREATE INDEX "search_performance_metrics_day_idx" ON "search_performance_metrics"("day");

-- CreateIndex
CREATE UNIQUE INDEX "search_performance_metrics_connectionId_day_dimension_key" ON "search_performance_metrics"("connectionId", "day", "dimension");

-- CreateIndex
CREATE INDEX "geo_visibility_observations_observedOn_platform_idx" ON "geo_visibility_observations"("observedOn", "platform");

-- CreateIndex
CREATE INDEX "geo_visibility_observations_articleId_idx" ON "geo_visibility_observations"("articleId");

-- CreateIndex
CREATE INDEX "analytics_sync_jobs_connectionId_createdAt_idx" ON "analytics_sync_jobs"("connectionId", "createdAt");

INSERT INTO "deployment_write_lock" (id,epoch) VALUES (1,0);
