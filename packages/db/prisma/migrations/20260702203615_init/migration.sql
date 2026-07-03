/*
  Warnings:

  - Added the required column `updatedAt` to the `Job` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `Queue` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'OPERATOR', 'VIEWER');

-- AlterEnum
ALTER TYPE "JobStatus" ADD VALUE 'FAILED';

-- AlterTable
ALTER TABLE "DeadLetterJob" ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "failureSummary" TEXT;

-- AlterTable
ALTER TABLE "Job" ADD COLUMN     "batchId" TEXT,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL;

-- AlterTable
ALTER TABLE "JobExecution" ADD COLUMN     "durationMs" INTEGER;

-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "Queue" ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "description" TEXT,
ADD COLUMN     "rateLimitCount" INTEGER,
ADD COLUMN     "rateLimitWindowSec" INTEGER,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL;

-- AlterTable
ALTER TABLE "RetryPolicy" ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "maxDelayMs" INTEGER;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "role" "UserRole" NOT NULL DEFAULT 'VIEWER';

-- AlterTable
ALTER TABLE "Worker" ADD COLUMN     "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateTable
CREATE TABLE "JobDependency" (
    "id" TEXT NOT NULL,
    "parentJobId" TEXT NOT NULL,
    "childJobId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JobDependency_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScheduledJob" (
    "id" TEXT NOT NULL,
    "queueId" TEXT NOT NULL,
    "jobType" TEXT NOT NULL,
    "payloadJson" JSONB NOT NULL,
    "cronExpression" TEXT,
    "nextRunAt" TIMESTAMP(3),
    "isPaused" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScheduledJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "JobDependency_childJobId_idx" ON "JobDependency"("childJobId");

-- CreateIndex
CREATE INDEX "JobDependency_parentJobId_idx" ON "JobDependency"("parentJobId");

-- CreateIndex
CREATE UNIQUE INDEX "JobDependency_parentJobId_childJobId_key" ON "JobDependency"("parentJobId", "childJobId");

-- CreateIndex
CREATE INDEX "ScheduledJob_queueId_idx" ON "ScheduledJob"("queueId");

-- CreateIndex
CREATE INDEX "ScheduledJob_nextRunAt_idx" ON "ScheduledJob"("nextRunAt");

-- CreateIndex
CREATE INDEX "Job_batchId_idx" ON "Job"("batchId");

-- CreateIndex
CREATE INDEX "Job_claimedByWorkerId_idx" ON "Job"("claimedByWorkerId");

-- CreateIndex
CREATE INDEX "Worker_status_idx" ON "Worker"("status");

-- AddForeignKey
ALTER TABLE "JobDependency" ADD CONSTRAINT "JobDependency_parentJobId_fkey" FOREIGN KEY ("parentJobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobDependency" ADD CONSTRAINT "JobDependency_childJobId_fkey" FOREIGN KEY ("childJobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduledJob" ADD CONSTRAINT "ScheduledJob_queueId_fkey" FOREIGN KEY ("queueId") REFERENCES "Queue"("id") ON DELETE CASCADE ON UPDATE CASCADE;
