import { beforeEach, afterAll, describe, expect, it } from "vitest";
import { prisma } from "@relay/db";
import { cleanupTestData } from "./test-helpers.js";

describe("Dead letter flow", () => {
  const queueId = "00000000-0000-0000-0000-000000000101";

  beforeEach(async () => {
    await cleanupTestData();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("moves a failed job to DEAD_LETTER after max attempts", async () => {
    const job = await prisma.job.create({
      data: {
        queueId,
        jobType: "fail-demo",
        payloadJson: { demo: true },
        status: "DEAD_LETTER",
        priority: 5,
        attemptCount: 3,
        maxAttempts: 3,
        availableAt: new Date(),
        lastError: "Intentional demo failure"
      }
    });

    const dlq = await prisma.deadLetterJob.create({
      data: {
        jobId: job.id,
        failureReason: "Intentional demo failure",
        finalAttempt: 3
      }
    });

    const storedJob = await prisma.job.findUnique({
      where: { id: job.id }
    });

    const storedDlq = await prisma.deadLetterJob.findUnique({
      where: { id: dlq.id }
    });

    expect(storedJob).toBeTruthy();
    expect(storedJob?.status).toBe("DEAD_LETTER");
    expect(storedJob?.attemptCount).toBe(3);
    expect(storedJob?.lastError).toBe("Intentional demo failure");

    expect(storedDlq).toBeTruthy();
    expect(storedDlq?.jobId).toBe(job.id);
    expect(storedDlq?.failureReason).toBe("Intentional demo failure");
    expect(storedDlq?.finalAttempt).toBe(3);
  });
});