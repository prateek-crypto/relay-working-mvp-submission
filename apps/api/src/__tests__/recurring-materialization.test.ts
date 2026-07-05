import { beforeEach, afterAll, describe, expect, it } from "vitest";
import { prisma } from "@relay/db";
import { cleanupTestData } from "./test-helpers.js";

describe("Recurring job materialization linkage", () => {
  const queueId = "00000000-0000-0000-0000-000000000102";

  beforeEach(async () => {
    await cleanupTestData();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("creates a job linked to its scheduled definition via sourceScheduledJobId", async () => {
    const scheduledJob = await prisma.scheduledJob.create({
      data: {
        queueId,
        name: "5-min sales report",
        jobType: "generate-report",
        payloadJson: { report: "daily-sales" },
        priority: 5,
        maxAttempts: 3,
        cronExpression: "*/5 * * * *",
        timezone: null,
        nextRunAt: new Date(Date.now() + 60_000),
        isPaused: false
      }
    });

    const job = await prisma.job.create({
      data: {
        queueId,
        jobType: scheduledJob.jobType,
        payloadJson: scheduledJob.payloadJson as any,
        status: "QUEUED",
        priority: scheduledJob.priority,
        attemptCount: 0,
        maxAttempts: scheduledJob.maxAttempts,
        availableAt: new Date(),
        sourceScheduledJobId: scheduledJob.id
      }
    });

    const stored = await prisma.job.findUnique({
      where: { id: job.id },
      include: {
        sourceScheduledJob: true
      }
    });

    expect(stored).toBeTruthy();
    expect(stored?.sourceScheduledJobId).toBe(scheduledJob.id);
    expect(stored?.sourceScheduledJob?.id).toBe(scheduledJob.id);
    expect(stored?.sourceScheduledJob?.cronExpression).toBe("*/5 * * * *");
  });
});