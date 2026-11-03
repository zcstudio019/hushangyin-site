-- CreateTable
CREATE TABLE "content_events" (
    "id" VARCHAR(64) NOT NULL,
    "dedupeKey" VARCHAR(64) NOT NULL,
    "type" VARCHAR(20) NOT NULL,
    "articleId" TEXT,
    "faqId" TEXT,
    "contentKey" VARCHAR(80) NOT NULL,
    "path" VARCHAR(200) NOT NULL,
    "channel" VARCHAR(20) NOT NULL,
    "sessionKey" VARCHAR(64) NOT NULL,
    "policyVersion" VARCHAR(40) NOT NULL,
    "day" DATE NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "content_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "content_daily_metrics" (
    "id" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "contentKey" VARCHAR(80) NOT NULL,
    "articleId" TEXT,
    "faqId" TEXT,
    "path" VARCHAR(200) NOT NULL,
    "channel" VARCHAR(20) NOT NULL,
    "pv" INTEGER NOT NULL DEFAULT 0,
    "visits" INTEGER NOT NULL DEFAULT 0,
    "clicks" INTEGER NOT NULL DEFAULT 0,
    "measuredConsultations" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "content_daily_metrics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lead_attributions" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "articleId" TEXT,
    "faqId" TEXT,
    "sourceType" VARCHAR(20) NOT NULL,
    "contentTitle" VARCHAR(300),
    "path" VARCHAR(200) NOT NULL,
    "channel" VARCHAR(20) NOT NULL,
    "confidence" VARCHAR(40) NOT NULL,
    "utmSource" VARCHAR(40),
    "utmMedium" VARCHAR(40),
    "utmCampaign" VARCHAR(40),
    "sessionKey" VARCHAR(64),
    "measured" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lead_attributions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "search_platform_connections" (
    "id" TEXT NOT NULL,
    "platform" VARCHAR(20) NOT NULL,
    "siteUrl" VARCHAR(300) NOT NULL,
    "label" VARCHAR(100) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "mode" VARCHAR(20) NOT NULL DEFAULT 'CSV_ONLY',
    "createdById" TEXT,
    "lastImportedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "search_platform_connections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "search_performance_metrics" (
    "id" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "dimension" VARCHAR(30) NOT NULL DEFAULT 'site-daily-web',
    "clicks" INTEGER NOT NULL,
    "impressions" INTEGER NOT NULL,
    "averagePosition" DOUBLE PRECISION,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "search_performance_metrics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "geo_visibility_observations" (
    "id" TEXT NOT NULL,
    "platform" VARCHAR(60) NOT NULL,
    "query" VARCHAR(300) NOT NULL,
    "observedOn" DATE NOT NULL,
    "brandMention" BOOLEAN NOT NULL,
    "siteCitation" BOOLEAN NOT NULL,
    "recommendation" BOOLEAN NOT NULL,
    "articleId" TEXT,
    "evidenceUrl" VARCHAR(1000) NOT NULL,
    "evidenceNote" VARCHAR(1500) NOT NULL,
    "actorId" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "geo_visibility_observations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "analytics_sync_jobs" (
    "id" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "actorId" TEXT,
    "kind" VARCHAR(20) NOT NULL,
    "status" VARCHAR(20) NOT NULL,
    "inputHash" VARCHAR(64),
    "result" JSONB,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMPTZ(3),

    CONSTRAINT "analytics_sync_jobs_pkey" PRIMARY KEY ("id")
);

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

-- AddForeignKey
ALTER TABLE "content_events" ADD CONSTRAINT "content_events_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "articles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_events" ADD CONSTRAINT "content_events_faqId_fkey" FOREIGN KEY ("faqId") REFERENCES "faqs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_daily_metrics" ADD CONSTRAINT "content_daily_metrics_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "articles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_daily_metrics" ADD CONSTRAINT "content_daily_metrics_faqId_fkey" FOREIGN KEY ("faqId") REFERENCES "faqs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_attributions" ADD CONSTRAINT "lead_attributions_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_attributions" ADD CONSTRAINT "lead_attributions_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "articles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_attributions" ADD CONSTRAINT "lead_attributions_faqId_fkey" FOREIGN KEY ("faqId") REFERENCES "faqs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "search_platform_connections" ADD CONSTRAINT "search_platform_connections_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "search_performance_metrics" ADD CONSTRAINT "search_performance_metrics_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "search_platform_connections"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "geo_visibility_observations" ADD CONSTRAINT "geo_visibility_observations_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "articles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "geo_visibility_observations" ADD CONSTRAINT "geo_visibility_observations_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "admin_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "analytics_sync_jobs" ADD CONSTRAINT "analytics_sync_jobs_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "search_platform_connections"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "analytics_sync_jobs" ADD CONSTRAINT "analytics_sync_jobs_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
