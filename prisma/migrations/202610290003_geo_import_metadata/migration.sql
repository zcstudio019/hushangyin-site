-- Additive only: preserve existing questions, answers and all customer data.
ALTER TABLE "geo_questions" ADD COLUMN "importMetadata" JSONB;
ALTER TABLE "faqs" ADD COLUMN "importMetadata" JSONB;
