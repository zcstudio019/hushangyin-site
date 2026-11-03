-- Additive migration: preserve accounts, password hashes, leads and history.
ALTER TYPE "AdminRole" RENAME VALUE 'ADMIN' TO 'SUPER_ADMIN';
ALTER TYPE "AdminRole" RENAME VALUE 'AGENT' TO 'FINANCING_ADVISOR';
ALTER TYPE "AdminRole" ADD VALUE 'SALES_MANAGER';
ALTER TYPE "AdminRole" ADD VALUE 'CONTENT_OPERATOR';
CREATE TABLE "departments" (
 "id" TEXT PRIMARY KEY, "name" VARCHAR(80) NOT NULL,
 "isActive" BOOLEAN NOT NULL DEFAULT true,
 "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updatedAt" TIMESTAMPTZ(3) NOT NULL
);
CREATE UNIQUE INDEX "departments_name_key" ON "departments"("name");
ALTER TABLE "admin_users"
 ADD COLUMN "departmentId" TEXT,
 ADD COLUMN "mustChangePassword" BOOLEAN NOT NULL DEFAULT false,
 ADD COLUMN "sessionVersion" INTEGER NOT NULL DEFAULT 0,
 ADD COLUMN "initialCredentialExpiresAt" TIMESTAMPTZ(3),
 ADD COLUMN "lastLoginAt" TIMESTAMPTZ(3);
ALTER TABLE "admin_sessions" ADD COLUMN "sessionVersion" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "leads" ADD COLUMN "departmentId" TEXT;
ALTER TABLE "admin_users" ADD CONSTRAINT "admin_users_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "leads" ADD CONSTRAINT "leads_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "admin_users_departmentId_role_isActive_idx" ON "admin_users"("departmentId","role","isActive");
CREATE INDEX "leads_departmentId_createdAt_idx" ON "leads"("departmentId","createdAt");
-- Invalidate existing cookies once, keep every account and password unchanged.
UPDATE "admin_users" SET "sessionVersion" = "sessionVersion" + 1;
