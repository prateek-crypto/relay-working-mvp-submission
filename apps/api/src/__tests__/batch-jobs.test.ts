import crypto from "node:crypto";
import { beforeEach, afterAll, describe, expect, it } from "vitest";
import { prisma } from "@relay/db";
import { cleanupTestData } from "./test-helpers.js";

describe("Batch job creation", () => {
  const queueId = "00000000-0000-0000-0000-000000000101";

  beforeEach(async () => {
    await cleanupTestData();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("creates multiple jobs with the same batchId", async () => {
    const queue = await prisma.queue.findUnique({
      where: { id: queueId }
    });

    expect(queue).toBeTruthy();
    if (!queue) {
      throw new Error(`Queue not found for test: ${queueId}`);
    }

    const batchId = crypto.randomUUID();
    const now = new Date();

    const createdJobs = await prisma.$transaction([
      prisma.job.create({
        data: {
          queueId,
          jobType: "send-email",
          payloadJson: { to: "demo@relay.dev", subject: "batch-1" },
          status: "QUEUED",
          priority: queue.defaultPriority,
          maxAttempts: 3,
          availableAt: now,
          batchId
        }
      }),
      prisma.job.create({
        data: {
          queueId,
          jobType: "send-email",
          payloadJson: { to: "demo@relay.dev", subject: "batch-2" },
          status: "SCHEDULED",
          priority: queue.defaultPriority,
          maxAttempts: 3,
          availableAt: new Date(now.getTime() + 60_000),
          batchId
        }
      }),
      prisma.job.create({
        data: {
          queueId,
          jobType: "send-email",
          payloadJson: { to: "demo@relay.dev", subject: "batch-3" },
          status: "SCHEDULED",
          priority: queue.defaultPriority,
          maxAttempts: 3,
          availableAt: new Date(now.getTime() + 120_000),
          batchId
        }
      })
    ]);

    expect(createdJobs).toHaveLength(3);
    expect(createdJobs.every((job) => job.batchId === batchId)).toBe(true);
    expect(createdJobs[0].status).toBe("QUEUED");
    expect(createdJobs[1].status).toBe("SCHEDULED");
    expect(createdJobs[2].status).toBe("SCHEDULED");
  });
});