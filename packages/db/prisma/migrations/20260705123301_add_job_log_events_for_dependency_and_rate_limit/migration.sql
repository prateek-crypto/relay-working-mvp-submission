-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "JobLogEvent" ADD VALUE 'BLOCKED_BY_DEPENDENCY';
ALTER TYPE "JobLogEvent" ADD VALUE 'RATE_LIMIT_SKIPPED';

-- DropIndex
DROP INDEX "JobLog_event_idx";

-- CreateIndex
CREATE INDEX "JobLog_jobId_event_createdAt_idx" ON "JobLog"("jobId", "event", "createdAt");
