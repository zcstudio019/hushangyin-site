-- AlterEnum
ALTER TYPE "AdminRole" ADD VALUE 'CONTENT_REVIEWER';

-- AlterTable
ALTER TABLE "articles" ADD COLUMN     "reviewAssignedAt" TIMESTAMPTZ(3),
ADD COLUMN     "reviewAssignedRevision" INTEGER,
ADD COLUMN     "reviewAssigneeId" TEXT;

-- AlterTable
ALTER TABLE "faqs" ADD COLUMN     "reviewAssignedAt" TIMESTAMPTZ(3),
ADD COLUMN     "reviewAssignedRevision" INTEGER,
ADD COLUMN     "reviewAssigneeId" TEXT;

-- CreateIndex
CREATE INDEX "articles_reviewAssigneeId_status_idx" ON "articles"("reviewAssigneeId", "status");

-- CreateIndex
CREATE INDEX "faqs_reviewAssigneeId_status_idx" ON "faqs"("reviewAssigneeId", "status");

-- AddForeignKey
ALTER TABLE "articles" ADD CONSTRAINT "articles_reviewAssigneeId_fkey" FOREIGN KEY ("reviewAssigneeId") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "faqs" ADD CONSTRAINT "faqs_reviewAssigneeId_fkey" FOREIGN KEY ("reviewAssigneeId") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
