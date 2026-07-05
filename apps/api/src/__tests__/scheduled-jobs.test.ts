import { beforeEach, afterAll, describe, expect, it } from "vitest";
import { prisma } from "@relay/db";
import { cleanupTestData } from "./test-helpers.js";

describe("Recurring scheduled job definitions", () => {
  const queueId = "00000000-0000-0000-0000-000000000102";

  beforeEach(async () => {
    await cleanupTestData();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("creates a recurring scheduled job definition", async () => {
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

    const stored = await prisma.scheduledJob.findUnique({
      where: { id: scheduledJob.id }
    });

    expect(stored).toBeTruthy();
    expect(stored?.queueId).toBe(queueId);
    expect(stored?.name).toBe("5-min sales report");
    expect(stored?.jobType).toBe("generate-report");
    expect(stored?.cronExpression).toBe("*/5 * * * *");
    expect(stored?.isPaused).toBe(false);
    expect(stored?.priority).toBe(5);
    expect(stored?.maxAttempts).toBe(3);
  });
});