/*
  Warnings:

  - Made the column `cronExpression` on table `ScheduledJob` required. This step will fail if there are existing NULL values in that column.
  - Made the column `nextRunAt` on table `ScheduledJob` required. This step will fail if there are existing NULL values in that column.

*/
-- CreateEnum
CREATE TYPE "JobLogLevel" AS ENUM ('INFO', 'WARN', 'ERROR');

-- AlterEnum
ALTER TYPE "JobStatus" ADD VALUE 'SCHEDULED';

-- AlterTable
ALTER TABLE "Job" ADD COLUMN     "sourceScheduledJobId" TEXT;

-- AlterTable
ALTER TABLE "ScheduledJob" ADD COLUMN     "lastEnqueuedAt" TIMESTAMP(3),
ADD COLUMN     "maxAttempts" INTEGER NOT NULL DEFAULT 3,
ADD COLUMN     "name" TEXT,
ADD COLUMN     "priority" INTEGER NOT NULL DEFAULT 5,
ADD COLUMN     "timezone" TEXT,
ALTER COLUMN "cronExpression" SET NOT NULL,
ALTER COLUMN "nextRunAt" SET NOT NULL;

-- CreateTable
CREATE TABLE "JobLog" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "level" "JobLogLevel" NOT NULL DEFAULT 'INFO',
    "message" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JobLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "JobLog_jobId_createdAt_idx" ON "JobLog"("jobId", "createdAt");

-- CreateIndex
CREATE INDEX "Job_sourceScheduledJobId_idx" ON "Job"("sourceScheduledJobId");

-- CreateIndex
CREATE INDEX "ScheduledJob_isPaused_nextRunAt_idx" ON "ScheduledJob"("isPaused", "nextRunAt");

-- AddForeignKey
ALTER TABLE "Job" ADD CONSTRAINT "Job_sourceScheduledJobId_fkey" FOREIGN KEY ("sourceScheduledJobId") REFERENCES "ScheduledJob"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobLog" ADD CONSTRAINT "JobLog_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;
