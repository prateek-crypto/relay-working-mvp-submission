-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('QUEUED', 'CLAIMED', 'RUNNING', 'COMPLETED', 'DEAD_LETTER');

-- CreateEnum
CREATE TYPE "RetryStrategy" AS ENUM ('FIXED', 'LINEAR', 'EXPONENTIAL');

-- CreateEnum
CREATE TYPE "WorkerStatus" AS ENUM ('ACTIVE', 'DRAINING', 'STOPPED');

-- CreateEnum
CREATE TYPE "ExecutionStatus" AS ENUM ('RUNNING', 'SUCCEEDED', 'FAILED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RetryPolicy" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "strategy" "RetryStrategy" NOT NULL,
    "baseDelayMs" INTEGER NOT NULL,
    "maxAttempts" INTEGER NOT NULL,

    CONSTRAINT "RetryPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Queue" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isPaused" BOOLEAN NOT NULL DEFAULT false,
    "defaultPriority" INTEGER NOT NULL DEFAULT 5,
    "concurrencyLimit" INTEGER NOT NULL DEFAULT 5,
    "retryPolicyId" TEXT,

    CONSTRAINT "Queue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Worker" (
    "id" TEXT NOT NULL,
    "workerName" TEXT NOT NULL,
    "status" "WorkerStatus" NOT NULL DEFAULT 'ACTIVE',
    "lastHeartbeatAt" TIMESTAMP(3),

    CONSTRAINT "Worker_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Job" (
    "id" TEXT NOT NULL,
    "queueId" TEXT NOT NULL,
    "jobType" TEXT NOT NULL,
    "payloadJson" JSONB NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'QUEUED',
    "priority" INTEGER NOT NULL DEFAULT 5,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 3,
    "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "claimedByWorkerId" TEXT,
    "leaseExpiresAt" TIMESTAMP(3),
    "claimedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Job_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobExecution" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "workerId" TEXT NOT NULL,
    "attemptNumber" INTEGER NOT NULL,
    "status" "ExecutionStatus" NOT NULL,
    "errorMessage" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "JobExecution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeadLetterJob" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "failureReason" TEXT NOT NULL,
    "finalAttempt" INTEGER NOT NULL,

    CONSTRAINT "DeadLetterJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Project_slug_key" ON "Project"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "RetryPolicy_name_key" ON "RetryPolicy"("name");

-- CreateIndex
CREATE INDEX "Queue_projectId_idx" ON "Queue"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "Queue_projectId_name_key" ON "Queue"("projectId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Worker_workerName_key" ON "Worker"("workerName");

-- CreateIndex
CREATE INDEX "Job_queueId_status_availableAt_createdAt_idx" ON "Job"("queueId", "status", "availableAt", "createdAt");

-- CreateIndex
CREATE INDEX "Job_status_availableAt_idx" ON "Job"("status", "availableAt");

-- CreateIndex
CREATE INDEX "JobExecution_jobId_attemptNumber_idx" ON "JobExecution"("jobId", "attemptNumber");

-- CreateIndex
CREATE INDEX "JobExecution_workerId_idx" ON "JobExecution"("workerId");

-- CreateIndex
CREATE UNIQUE INDEX "DeadLetterJob_jobId_key" ON "DeadLetterJob"("jobId");

-- AddForeignKey
ALTER TABLE "Queue" ADD CONSTRAINT "Queue_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Queue" ADD CONSTRAINT "Queue_retryPolicyId_fkey" FOREIGN KEY ("retryPolicyId") REFERENCES "RetryPolicy"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Job" ADD CONSTRAINT "Job_queueId_fkey" FOREIGN KEY ("queueId") REFERENCES "Queue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobExecution" ADD CONSTRAINT "JobExecution_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobExecution" ADD CONSTRAINT "JobExecution_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "Worker"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeadLetterJob" ADD CONSTRAINT "DeadLetterJob_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;
