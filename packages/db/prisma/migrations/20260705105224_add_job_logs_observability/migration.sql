/*
  Warnings:

  - Added the required column `event` to the `JobLog` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "JobLogEvent" AS ENUM ('CLAIMED', 'STARTED', 'COMPLETED', 'FAILED', 'RETRY_SCHEDULED', 'DEAD_LETTER', 'SCHEDULED_PROMOTED', 'RECURRING_MATERIALIZED');

-- AlterTable
ALTER TABLE "JobLog" ADD COLUMN     "event" "JobLogEvent" NOT NULL,
ADD COLUMN     "metadataJson" JSONB;

-- CreateIndex
CREATE INDEX "JobLog_event_idx" ON "JobLog"("event");
