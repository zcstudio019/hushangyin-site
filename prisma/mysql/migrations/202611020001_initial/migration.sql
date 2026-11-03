-- CreateTable
CREATE TABLE `customers` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(40) NOT NULL,
    `phone` VARCHAR(11) NOT NULL,
    `customerType` ENUM('ENTERPRISE', 'SELF_EMPLOYED', 'PERSONAL') NOT NULL,
    `companyName` VARCHAR(120) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `customers_phone_idx`(`phone`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin;

-- CreateTable
CREATE TABLE `leads` (
    `id` VARCHAR(191) NOT NULL,
    `customerId` VARCHAR(191) NULL,
    `name` VARCHAR(40) NOT NULL,
    `phone` VARCHAR(11) NOT NULL,
    `customerType` ENUM('ENTERPRISE', 'SELF_EMPLOYED', 'PERSONAL') NOT NULL,
    `financingAmount` VARCHAR(40) NOT NULL,
    `hasProperty` BOOLEAN NULL,
    `hasCompany` BOOLEAN NULL,
    `remark` VARCHAR(600) NULL,
    `source` VARCHAR(40) NOT NULL DEFAULT 'website',
    `sourcePage` VARCHAR(200) NOT NULL,
    `sourceArticleId` VARCHAR(191) NULL,
    `sourceParameters` JSON NULL,
    `status` ENUM('NEW', 'PENDING', 'FOLLOWING', 'COMPLETED', 'INVALID') NOT NULL DEFAULT 'NEW',
    `assignedTo` VARCHAR(191) NULL,
    `departmentId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `leads_status_createdAt_idx`(`status`, `createdAt`),
    INDEX `leads_assignedTo_createdAt_idx`(`assignedTo`, `createdAt`),
    INDEX `leads_departmentId_createdAt_idx`(`departmentId`, `createdAt`),
    INDEX `leads_customerId_idx`(`customerId`),
    INDEX `leads_phone_idx`(`phone`),
    INDEX `leads_updatedAt_idx`(`updatedAt`),
    INDEX `leads_sourceArticleId_createdAt_idx`(`sourceArticleId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin;

-- CreateTable
CREATE TABLE `admin_users` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(80) NOT NULL,
    `email` VARCHAR(254) NOT NULL,
    `passwordHash` VARCHAR(255) NOT NULL,
    `role` ENUM('SUPER_ADMIN', 'SALES_MANAGER', 'FINANCING_ADVISOR', 'CONTENT_OPERATOR', 'CONTENT_REVIEWER') NOT NULL DEFAULT 'FINANCING_ADVISOR',
    `departmentId` VARCHAR(191) NULL,
    `mustChangePassword` BOOLEAN NOT NULL DEFAULT false,
    `sessionVersion` INTEGER NOT NULL DEFAULT 0,
    `initialCredentialExpiresAt` DATETIME(3) NULL,
    `lastLoginAt` DATETIME(3) NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `admin_users_email_key`(`email`),
    INDEX `admin_users_departmentId_role_isActive_idx`(`departmentId`, `role`, `isActive`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin;

-- CreateTable
CREATE TABLE `departments` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(80) NOT NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `departments_name_key`(`name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin;

-- CreateTable
CREATE TABLE `audit_logs` (
    `id` VARCHAR(191) NOT NULL,
    `actorId` VARCHAR(191) NULL,
    `action` VARCHAR(60) NOT NULL,
    `resourceType` VARCHAR(40) NOT NULL,
    `resourceId` VARCHAR(64) NULL,
    `metadata` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `audit_logs_actorId_createdAt_idx`(`actorId`, `createdAt`),
    INDEX `audit_logs_resourceType_resourceId_idx`(`resourceType`, `resourceId`),
    INDEX `audit_logs_createdAt_idx`(`createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin;

-- CreateTable
CREATE TABLE `consents` (
    `id` VARCHAR(191) NOT NULL,
    `leadId` VARCHAR(191) NULL,
    `customerId` VARCHAR(191) NULL,
    `consentType` VARCHAR(60) NOT NULL,
    `policyVersion` VARCHAR(40) NOT NULL,
    `agreedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `evidenceReference` VARCHAR(128) NOT NULL,

    UNIQUE INDEX `consents_evidenceReference_key`(`evidenceReference`),
    INDEX `consents_leadId_idx`(`leadId`),
    INDEX `consents_customerId_idx`(`customerId`),
    INDEX `consents_agreedAt_idx`(`agreedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin;

-- CreateTable
CREATE TABLE `articles` (
    `reviewAssigneeId` VARCHAR(191) NULL,
    `reviewAssignedRevision` INTEGER NULL,
    `reviewAssignedAt` DATETIME(3) NULL,
    `id` VARCHAR(191) NOT NULL,
    `title` VARCHAR(200) NOT NULL,
    `slug` VARCHAR(160) NOT NULL,
    `summary` VARCHAR(600) NOT NULL,
    `content` TEXT NOT NULL,
    `category` VARCHAR(80) NOT NULL,
    `status` ENUM('DRAFT', 'IN_REVIEW', 'APPROVED', 'PUBLISHED', 'ARCHIVED') NOT NULL DEFAULT 'DRAFT',
    `publishedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `tags` JSON NOT NULL,
    `sources` JSON NOT NULL,
    `contentFormat` VARCHAR(20) NOT NULL DEFAULT 'MARKDOWN',
    `authorId` VARCHAR(191) NULL,
    `editorId` VARCHAR(191) NULL,
    `aiAssisted` BOOLEAN NOT NULL DEFAULT false,
    `revision` INTEGER NOT NULL DEFAULT 0,
    `isLive` BOOLEAN NOT NULL DEFAULT false,
    `publishedSnapshot` JSON NULL,
    `publishedRevision` INTEGER NULL,
    `submittedAt` DATETIME(3) NULL,
    `submittedById` VARCHAR(191) NULL,
    `seoTitle` VARCHAR(200) NULL,
    `metaDescription` VARCHAR(600) NULL,
    `generationMetadata` JSON NULL,
    `complianceReport` JSON NULL,

    UNIQUE INDEX `articles_slug_key`(`slug`),
    INDEX `articles_status_publishedAt_idx`(`status`, `publishedAt`),
    INDEX `articles_status_submittedAt_idx`(`status`, `submittedAt`),
    INDEX `articles_reviewAssigneeId_status_idx`(`reviewAssigneeId`, `status`),
    INDEX `articles_isLive_publishedAt_idx`(`isLive`, `publishedAt`),
    INDEX `articles_category_status_idx`(`category`, `status`),
    INDEX `articles_authorId_idx`(`authorId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin;

-- CreateTable
CREATE TABLE `faqs` (
    `reviewAssigneeId` VARCHAR(191) NULL,
    `reviewAssignedRevision` INTEGER NULL,
    `reviewAssignedAt` DATETIME(3) NULL,
    `id` VARCHAR(191) NOT NULL,
    `question` VARCHAR(300) NOT NULL,
    `importMetadata` JSON NULL,
    `answer` TEXT NOT NULL,
    `category` VARCHAR(80) NOT NULL,
    `status` ENUM('DRAFT', 'IN_REVIEW', 'APPROVED', 'PUBLISHED', 'ARCHIVED') NOT NULL DEFAULT 'DRAFT',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `articleId` VARCHAR(191) NULL,
    `sources` JSON NOT NULL,
    `authorId` VARCHAR(191) NULL,
    `editorId` VARCHAR(191) NULL,
    `revision` INTEGER NOT NULL DEFAULT 0,
    `isLive` BOOLEAN NOT NULL DEFAULT false,
    `publishedAt` DATETIME(3) NULL,
    `publishedSnapshot` JSON NULL,
    `publishedRevision` INTEGER NULL,
    `submittedAt` DATETIME(3) NULL,
    `submittedById` VARCHAR(191) NULL,

    UNIQUE INDEX `faqs_question_key`(`question`),
    INDEX `faqs_status_category_idx`(`status`, `category`),
    INDEX `faqs_status_submittedAt_idx`(`status`, `submittedAt`),
    INDEX `faqs_reviewAssigneeId_status_idx`(`reviewAssigneeId`, `status`),
    INDEX `faqs_articleId_isLive_idx`(`articleId`, `isLive`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin;

-- CreateTable
CREATE TABLE `geo_questions` (
    `id` VARCHAR(191) NOT NULL,
    `question` VARCHAR(300) NOT NULL,
    `importMetadata` JSON NULL,
    `category` VARCHAR(80) NOT NULL,
    `keywords` JSON NOT NULL,
    `intent` ENUM('AWARENESS', 'COMPARISON', 'DECISION', 'PREPARATION') NOT NULL DEFAULT 'AWARENESS',
    `priority` INTEGER NOT NULL DEFAULT 3,
    `status` ENUM('OPEN', 'PLANNED', 'ANSWERED', 'ARCHIVED') NOT NULL DEFAULT 'OPEN',
    `articleId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `geo_questions_question_key`(`question`),
    INDEX `geo_questions_status_priority_idx`(`status`, `priority`),
    INDEX `geo_questions_category_intent_idx`(`category`, `intent`),
    INDEX `geo_questions_articleId_idx`(`articleId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin;

-- CreateTable
CREATE TABLE `geo_generation_templates` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(100) NOT NULL,
    `description` VARCHAR(600) NOT NULL,
    `templateContent` TEXT NOT NULL,
    `version` INTEGER NOT NULL DEFAULT 1,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `updatedById` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `geo_generation_templates_name_key`(`name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin;

-- CreateTable
CREATE TABLE `geo_generation_tasks` (
    `id` VARCHAR(191) NOT NULL,
    `questionId` VARCHAR(191) NOT NULL,
    `createdById` VARCHAR(191) NOT NULL,
    `creatorSessionVersion` INTEGER NOT NULL,
    `status` ENUM('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELLED') NOT NULL DEFAULT 'QUEUED',
    `articleType` VARCHAR(60) NOT NULL,
    `audience` VARCHAR(120) NOT NULL,
    `depth` VARCHAR(30) NOT NULL,
    `templateId` VARCHAR(191) NOT NULL,
    `templateVersion` INTEGER NOT NULL,
    `providerName` VARCHAR(60) NOT NULL,
    `modelName` VARCHAR(100) NOT NULL,
    `inputSnapshot` JSON NOT NULL,
    `output` JSON NULL,
    `outputArticleId` VARCHAR(191) NULL,
    `idempotencyKey` VARCHAR(80) NOT NULL,
    `activeKey` VARCHAR(64) NULL,
    `attempts` INTEGER NOT NULL DEFAULT 0,
    `maxAttempts` INTEGER NOT NULL DEFAULT 3,
    `timeoutMs` INTEGER NOT NULL DEFAULT 90000,
    `maxOutputTokens` INTEGER NOT NULL DEFAULT 4000,
    `leaseToken` VARCHAR(64) NULL,
    `leaseUntil` DATETIME(3) NULL,
    `availableAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `errorCode` VARCHAR(60) NULL,
    `errorMessage` VARCHAR(400) NULL,
    `tokenUsage` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `startedAt` DATETIME(3) NULL,
    `completedAt` DATETIME(3) NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `geo_generation_tasks_outputArticleId_key`(`outputArticleId`),
    UNIQUE INDEX `geo_generation_tasks_activeKey_key`(`activeKey`),
    INDEX `geo_generation_tasks_status_availableAt_idx`(`status`, `availableAt`),
    INDEX `geo_generation_tasks_createdById_createdAt_idx`(`createdById`, `createdAt`),
    INDEX `geo_generation_tasks_questionId_idx`(`questionId`),
    INDEX `geo_generation_tasks_leaseUntil_idx`(`leaseUntil`),
    UNIQUE INDEX `geo_generation_tasks_createdById_idempotencyKey_key`(`createdById`, `idempotencyKey`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin;

-- CreateTable
CREATE TABLE `generation_call_logs` (
    `id` VARCHAR(191) NOT NULL,
    `taskId` VARCHAR(191) NOT NULL,
    `attempt` INTEGER NOT NULL,
    `provider` VARCHAR(60) NOT NULL,
    `model` VARCHAR(100) NOT NULL,
    `requestId` VARCHAR(120) NULL,
    `status` VARCHAR(40) NOT NULL,
    `errorCode` VARCHAR(60) NULL,
    `usage` JSON NULL,
    `estimatedCostUsd` DECIMAL(12, 6) NULL,
    `startedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `completedAt` DATETIME(3) NULL,

    UNIQUE INDEX `generation_call_logs_taskId_attempt_key`(`taskId`, `attempt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin;

-- CreateTable
CREATE TABLE `generation_worker_heartbeats` (
    `id` VARCHAR(80) NOT NULL,
    `lastSeenAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin;

-- CreateTable
CREATE TABLE `article_question_relations` (
    `articleId` VARCHAR(191) NOT NULL,
    `questionId` VARCHAR(191) NOT NULL,
    `relationType` VARCHAR(20) NOT NULL DEFAULT 'RELATED',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `article_question_relations_questionId_idx`(`questionId`),
    PRIMARY KEY (`articleId`, `questionId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin;

-- CreateTable
CREATE TABLE `article_faq_relations` (
    `articleId` VARCHAR(191) NOT NULL,
    `faqId` VARCHAR(191) NOT NULL,
    `revision` INTEGER NOT NULL,
    `evidenceMode` VARCHAR(20) NOT NULL,

    INDEX `article_faq_relations_faqId_idx`(`faqId`),
    PRIMARY KEY (`articleId`, `faqId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin;

-- CreateTable
CREATE TABLE `article_sources` (
    `id` VARCHAR(191) NOT NULL,
    `articleId` VARCHAR(191) NULL,
    `catalogId` VARCHAR(191) NULL,
    `title` VARCHAR(200) NOT NULL,
    `sourceUrl` VARCHAR(1000) NOT NULL,
    `sourceType` VARCHAR(30) NOT NULL DEFAULT 'REFERENCE',
    `excerpt` VARCHAR(4000) NOT NULL,
    `paragraph` VARCHAR(2000) NULL,
    `verifiedAt` DATETIME(3) NULL,
    `validUntil` DATETIME(3) NULL,
    `verifiedById` VARCHAR(191) NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `revision` INTEGER NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `article_sources_articleId_revision_idx`(`articleId`, `revision`),
    INDEX `article_sources_catalogId_idx`(`catalogId`),
    INDEX `article_sources_isActive_verifiedAt_idx`(`isActive`, `verifiedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin;

-- CreateTable
CREATE TABLE `article_versions` (
    `id` VARCHAR(191) NOT NULL,
    `articleId` VARCHAR(191) NOT NULL,
    `revision` INTEGER NOT NULL,
    `snapshot` JSON NOT NULL,
    `editorId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `article_versions_articleId_revision_key`(`articleId`, `revision`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin;

-- CreateTable
CREATE TABLE `faq_versions` (
    `id` VARCHAR(191) NOT NULL,
    `faqId` VARCHAR(191) NOT NULL,
    `revision` INTEGER NOT NULL,
    `snapshot` JSON NOT NULL,
    `editorId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `faq_versions_faqId_revision_key`(`faqId`, `revision`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin;

-- CreateTable
CREATE TABLE `article_relations` (
    `fromId` VARCHAR(191) NOT NULL,
    `toId` VARCHAR(191) NOT NULL,

    INDEX `article_relations_toId_idx`(`toId`),
    PRIMARY KEY (`fromId`, `toId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin;

-- CreateTable
CREATE TABLE `content_reviews` (
    `id` VARCHAR(191) NOT NULL,
    `articleId` VARCHAR(191) NULL,
    `faqId` VARCHAR(191) NULL,
    `revision` INTEGER NOT NULL,
    `reviewerId` VARCHAR(191) NOT NULL,
    `decision` VARCHAR(20) NOT NULL,
    `checklist` JSON NOT NULL,
    `note` VARCHAR(1000) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `content_reviews_reviewerId_createdAt_idx`(`reviewerId`, `createdAt`),
    UNIQUE INDEX `content_reviews_articleId_revision_key`(`articleId`, `revision`),
    UNIQUE INDEX `content_reviews_faqId_revision_key`(`faqId`, `revision`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin;

-- CreateTable
CREATE TABLE `loan_products` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(160) NOT NULL,
    `category` VARCHAR(80) NOT NULL,
    `targetCustomer` VARCHAR(300) NOT NULL,
    `description` TEXT NOT NULL,
    `requirements` JSON NOT NULL,
    `status` ENUM('DRAFT', 'IN_REVIEW', 'APPROVED', 'PUBLISHED', 'ARCHIVED') NOT NULL DEFAULT 'DRAFT',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `loan_products_name_key`(`name`),
    INDEX `loan_products_status_category_idx`(`status`, `category`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin;

-- CreateTable
CREATE TABLE `admin_sessions` (
    `id` VARCHAR(191) NOT NULL,
    `tokenHash` VARCHAR(64) NOT NULL,
    `adminId` VARCHAR(191) NOT NULL,
    `sessionVersion` INTEGER NOT NULL DEFAULT 0,
    `expiresAt` DATETIME(3) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `admin_sessions_tokenHash_key`(`tokenHash`),
    INDEX `admin_sessions_adminId_idx`(`adminId`),
    INDEX `admin_sessions_expiresAt_idx`(`expiresAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin;

-- CreateTable
CREATE TABLE `rate_limit_buckets` (
    `key` VARCHAR(100) NOT NULL,
    `count` INTEGER NOT NULL DEFAULT 1,
    `expiresAt` DATETIME(3) NOT NULL,

    INDEX `rate_limit_buckets_expiresAt_idx`(`expiresAt`),
    PRIMARY KEY (`key`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin;

-- CreateTable
CREATE TABLE `submission_guards` (
    `key` VARCHAR(64) NOT NULL,
    `expiresAt` DATETIME(3) NOT NULL,

    INDEX `submission_guards_expiresAt_idx`(`expiresAt`),
    PRIMARY KEY (`key`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin;

-- CreateTable
CREATE TABLE `content_events` (
    `id` VARCHAR(64) NOT NULL,
    `dedupeKey` VARCHAR(64) NOT NULL,
    `type` VARCHAR(20) NOT NULL,
    `articleId` VARCHAR(191) NULL,
    `faqId` VARCHAR(191) NULL,
    `contentKey` VARCHAR(80) NOT NULL,
    `path` VARCHAR(200) NOT NULL,
    `channel` VARCHAR(20) NOT NULL,
    `sessionKey` VARCHAR(64) NOT NULL,
    `policyVersion` VARCHAR(40) NOT NULL,
    `day` DATE NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `content_events_dedupeKey_key`(`dedupeKey`),
    INDEX `content_events_day_contentKey_type_idx`(`day`, `contentKey`, `type`),
    INDEX `content_events_sessionKey_contentKey_type_idx`(`sessionKey`, `contentKey`, `type`),
    INDEX `content_events_createdAt_idx`(`createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin;

-- CreateTable
CREATE TABLE `content_daily_metrics` (
    `id` VARCHAR(191) NOT NULL,
    `day` DATE NOT NULL,
    `contentKey` VARCHAR(80) NOT NULL,
    `articleId` VARCHAR(191) NULL,
    `faqId` VARCHAR(191) NULL,
    `path` VARCHAR(200) NOT NULL,
    `channel` VARCHAR(20) NOT NULL,
    `pv` INTEGER NOT NULL DEFAULT 0,
    `visits` INTEGER NOT NULL DEFAULT 0,
    `clicks` INTEGER NOT NULL DEFAULT 0,
    `measuredConsultations` INTEGER NOT NULL DEFAULT 0,
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `content_daily_metrics_articleId_day_idx`(`articleId`, `day`),
    INDEX `content_daily_metrics_faqId_day_idx`(`faqId`, `day`),
    UNIQUE INDEX `content_daily_metrics_day_contentKey_channel_key`(`day`, `contentKey`, `channel`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin;

-- CreateTable
CREATE TABLE `lead_attributions` (
    `id` VARCHAR(191) NOT NULL,
    `leadId` VARCHAR(191) NOT NULL,
    `articleId` VARCHAR(191) NULL,
    `faqId` VARCHAR(191) NULL,
    `sourceType` VARCHAR(20) NOT NULL,
    `contentTitle` VARCHAR(300) NULL,
    `path` VARCHAR(200) NOT NULL,
    `channel` VARCHAR(20) NOT NULL,
    `confidence` VARCHAR(40) NOT NULL,
    `utmSource` VARCHAR(40) NULL,
    `utmMedium` VARCHAR(40) NULL,
    `utmCampaign` VARCHAR(40) NULL,
    `sessionKey` VARCHAR(64) NULL,
    `measured` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `lead_attributions_leadId_key`(`leadId`),
    INDEX `lead_attributions_articleId_createdAt_idx`(`articleId`, `createdAt`),
    INDEX `lead_attributions_faqId_createdAt_idx`(`faqId`, `createdAt`),
    INDEX `lead_attributions_channel_createdAt_idx`(`channel`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin;

-- CreateTable
CREATE TABLE `search_platform_connections` (
    `id` VARCHAR(191) NOT NULL,
    `platform` VARCHAR(20) NOT NULL,
    `siteUrl` VARCHAR(300) NOT NULL,
    `label` VARCHAR(100) NOT NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `mode` VARCHAR(20) NOT NULL DEFAULT 'CSV_ONLY',
    `createdById` VARCHAR(191) NULL,
    `lastImportedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `search_platform_connections_platform_siteUrl_key`(`platform`, `siteUrl`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin;

-- CreateTable
CREATE TABLE `search_performance_metrics` (
    `id` VARCHAR(191) NOT NULL,
    `connectionId` VARCHAR(191) NOT NULL,
    `day` DATE NOT NULL,
    `dimension` VARCHAR(30) NOT NULL DEFAULT 'site-daily-web',
    `clicks` INTEGER NOT NULL,
    `impressions` INTEGER NOT NULL,
    `averagePosition` DOUBLE NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `search_performance_metrics_day_idx`(`day`),
    UNIQUE INDEX `search_performance_metrics_connectionId_day_dimension_key`(`connectionId`, `day`, `dimension`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin;

-- CreateTable
CREATE TABLE `geo_visibility_observations` (
    `id` VARCHAR(191) NOT NULL,
    `platform` VARCHAR(60) NOT NULL,
    `query` VARCHAR(300) NOT NULL,
    `observedOn` DATE NOT NULL,
    `brandMention` BOOLEAN NOT NULL,
    `siteCitation` BOOLEAN NOT NULL,
    `recommendation` BOOLEAN NOT NULL,
    `articleId` VARCHAR(191) NULL,
    `evidenceUrl` VARCHAR(1000) NOT NULL,
    `evidenceNote` VARCHAR(1500) NOT NULL,
    `actorId` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `geo_visibility_observations_observedOn_platform_idx`(`observedOn`, `platform`),
    INDEX `geo_visibility_observations_articleId_idx`(`articleId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin;

-- CreateTable
CREATE TABLE `analytics_sync_jobs` (
    `id` VARCHAR(191) NOT NULL,
    `connectionId` VARCHAR(191) NOT NULL,
    `actorId` VARCHAR(191) NULL,
    `kind` VARCHAR(20) NOT NULL,
    `status` VARCHAR(20) NOT NULL,
    `inputHash` VARCHAR(64) NULL,
    `result` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `completedAt` DATETIME(3) NULL,

    INDEX `analytics_sync_jobs_connectionId_createdAt_idx`(`connectionId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin;

-- CreateTable
CREATE TABLE `deployment_write_lock` (
    `id` INTEGER NOT NULL,
    `epoch` INTEGER NOT NULL DEFAULT 0,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin;

-- AddForeignKey
ALTER TABLE `leads` ADD CONSTRAINT `leads_customerId_fkey` FOREIGN KEY (`customerId`) REFERENCES `customers`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `leads` ADD CONSTRAINT `leads_sourceArticleId_fkey` FOREIGN KEY (`sourceArticleId`) REFERENCES `articles`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `leads` ADD CONSTRAINT `leads_departmentId_fkey` FOREIGN KEY (`departmentId`) REFERENCES `departments`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `leads` ADD CONSTRAINT `leads_assignedTo_fkey` FOREIGN KEY (`assignedTo`) REFERENCES `admin_users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `admin_users` ADD CONSTRAINT `admin_users_departmentId_fkey` FOREIGN KEY (`departmentId`) REFERENCES `departments`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `audit_logs` ADD CONSTRAINT `audit_logs_actorId_fkey` FOREIGN KEY (`actorId`) REFERENCES `admin_users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `consents` ADD CONSTRAINT `consents_leadId_fkey` FOREIGN KEY (`leadId`) REFERENCES `leads`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `consents` ADD CONSTRAINT `consents_customerId_fkey` FOREIGN KEY (`customerId`) REFERENCES `customers`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `articles` ADD CONSTRAINT `articles_reviewAssigneeId_fkey` FOREIGN KEY (`reviewAssigneeId`) REFERENCES `admin_users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `articles` ADD CONSTRAINT `articles_authorId_fkey` FOREIGN KEY (`authorId`) REFERENCES `admin_users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `articles` ADD CONSTRAINT `articles_editorId_fkey` FOREIGN KEY (`editorId`) REFERENCES `admin_users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `articles` ADD CONSTRAINT `articles_submittedById_fkey` FOREIGN KEY (`submittedById`) REFERENCES `admin_users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `faqs` ADD CONSTRAINT `faqs_reviewAssigneeId_fkey` FOREIGN KEY (`reviewAssigneeId`) REFERENCES `admin_users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `faqs` ADD CONSTRAINT `faqs_articleId_fkey` FOREIGN KEY (`articleId`) REFERENCES `articles`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `faqs` ADD CONSTRAINT `faqs_authorId_fkey` FOREIGN KEY (`authorId`) REFERENCES `admin_users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `faqs` ADD CONSTRAINT `faqs_editorId_fkey` FOREIGN KEY (`editorId`) REFERENCES `admin_users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `faqs` ADD CONSTRAINT `faqs_submittedById_fkey` FOREIGN KEY (`submittedById`) REFERENCES `admin_users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `geo_questions` ADD CONSTRAINT `geo_questions_articleId_fkey` FOREIGN KEY (`articleId`) REFERENCES `articles`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `geo_generation_templates` ADD CONSTRAINT `geo_generation_templates_updatedById_fkey` FOREIGN KEY (`updatedById`) REFERENCES `admin_users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `geo_generation_tasks` ADD CONSTRAINT `geo_generation_tasks_questionId_fkey` FOREIGN KEY (`questionId`) REFERENCES `geo_questions`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `geo_generation_tasks` ADD CONSTRAINT `geo_generation_tasks_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `admin_users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `geo_generation_tasks` ADD CONSTRAINT `geo_generation_tasks_templateId_fkey` FOREIGN KEY (`templateId`) REFERENCES `geo_generation_templates`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `geo_generation_tasks` ADD CONSTRAINT `geo_generation_tasks_outputArticleId_fkey` FOREIGN KEY (`outputArticleId`) REFERENCES `articles`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `generation_call_logs` ADD CONSTRAINT `generation_call_logs_taskId_fkey` FOREIGN KEY (`taskId`) REFERENCES `geo_generation_tasks`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `article_question_relations` ADD CONSTRAINT `article_question_relations_articleId_fkey` FOREIGN KEY (`articleId`) REFERENCES `articles`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `article_question_relations` ADD CONSTRAINT `article_question_relations_questionId_fkey` FOREIGN KEY (`questionId`) REFERENCES `geo_questions`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `article_faq_relations` ADD CONSTRAINT `article_faq_relations_articleId_fkey` FOREIGN KEY (`articleId`) REFERENCES `articles`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `article_faq_relations` ADD CONSTRAINT `article_faq_relations_faqId_fkey` FOREIGN KEY (`faqId`) REFERENCES `faqs`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `article_sources` ADD CONSTRAINT `article_sources_articleId_fkey` FOREIGN KEY (`articleId`) REFERENCES `articles`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `article_sources` ADD CONSTRAINT `article_sources_catalogId_fkey` FOREIGN KEY (`catalogId`) REFERENCES `article_sources`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `article_sources` ADD CONSTRAINT `article_sources_verifiedById_fkey` FOREIGN KEY (`verifiedById`) REFERENCES `admin_users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `article_versions` ADD CONSTRAINT `article_versions_articleId_fkey` FOREIGN KEY (`articleId`) REFERENCES `articles`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `article_versions` ADD CONSTRAINT `article_versions_editorId_fkey` FOREIGN KEY (`editorId`) REFERENCES `admin_users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `faq_versions` ADD CONSTRAINT `faq_versions_faqId_fkey` FOREIGN KEY (`faqId`) REFERENCES `faqs`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `faq_versions` ADD CONSTRAINT `faq_versions_editorId_fkey` FOREIGN KEY (`editorId`) REFERENCES `admin_users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `article_relations` ADD CONSTRAINT `article_relations_fromId_fkey` FOREIGN KEY (`fromId`) REFERENCES `articles`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `article_relations` ADD CONSTRAINT `article_relations_toId_fkey` FOREIGN KEY (`toId`) REFERENCES `articles`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `content_reviews` ADD CONSTRAINT `content_reviews_articleId_fkey` FOREIGN KEY (`articleId`) REFERENCES `articles`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `content_reviews` ADD CONSTRAINT `content_reviews_faqId_fkey` FOREIGN KEY (`faqId`) REFERENCES `faqs`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `content_reviews` ADD CONSTRAINT `content_reviews_reviewerId_fkey` FOREIGN KEY (`reviewerId`) REFERENCES `admin_users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `admin_sessions` ADD CONSTRAINT `admin_sessions_adminId_fkey` FOREIGN KEY (`adminId`) REFERENCES `admin_users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `content_events` ADD CONSTRAINT `content_events_articleId_fkey` FOREIGN KEY (`articleId`) REFERENCES `articles`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `content_events` ADD CONSTRAINT `content_events_faqId_fkey` FOREIGN KEY (`faqId`) REFERENCES `faqs`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `content_daily_metrics` ADD CONSTRAINT `content_daily_metrics_articleId_fkey` FOREIGN KEY (`articleId`) REFERENCES `articles`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `content_daily_metrics` ADD CONSTRAINT `content_daily_metrics_faqId_fkey` FOREIGN KEY (`faqId`) REFERENCES `faqs`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `lead_attributions` ADD CONSTRAINT `lead_attributions_leadId_fkey` FOREIGN KEY (`leadId`) REFERENCES `leads`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `lead_attributions` ADD CONSTRAINT `lead_attributions_articleId_fkey` FOREIGN KEY (`articleId`) REFERENCES `articles`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `lead_attributions` ADD CONSTRAINT `lead_attributions_faqId_fkey` FOREIGN KEY (`faqId`) REFERENCES `faqs`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `search_platform_connections` ADD CONSTRAINT `search_platform_connections_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `admin_users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `search_performance_metrics` ADD CONSTRAINT `search_performance_metrics_connectionId_fkey` FOREIGN KEY (`connectionId`) REFERENCES `search_platform_connections`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `geo_visibility_observations` ADD CONSTRAINT `geo_visibility_observations_articleId_fkey` FOREIGN KEY (`articleId`) REFERENCES `articles`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `geo_visibility_observations` ADD CONSTRAINT `geo_visibility_observations_actorId_fkey` FOREIGN KEY (`actorId`) REFERENCES `admin_users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `analytics_sync_jobs` ADD CONSTRAINT `analytics_sync_jobs_connectionId_fkey` FOREIGN KEY (`connectionId`) REFERENCES `search_platform_connections`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `analytics_sync_jobs` ADD CONSTRAINT `analytics_sync_jobs_actorId_fkey` FOREIGN KEY (`actorId`) REFERENCES `admin_users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO `deployment_write_lock` (id,epoch) VALUES (1,0);
