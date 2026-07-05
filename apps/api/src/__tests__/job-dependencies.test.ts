import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@relay/db";
import { cleanupTestData } from "./test-helpers.js";

describe("Job dependency flow", () => {
  const queueId = "00000000-0000-0000-0000-000000000101";

  beforeEach(async () => {
    await cleanupTestData();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("blocks child job until parent job is completed", async () => {
    const now = new Date();

    const parentJob = await prisma.job.create({
      data: {
        queueId,
        jobType: "send-email",
        payloadJson: {
          to: "demo@relay.dev",
          subject: "parent-job"
        },
        status: "QUEUED",
        priority: 5,
        attemptCount: 0,
        maxAttempts: 3,
        availableAt: now
      }
    });

    const childJob = await prisma.job.create({
      data: {
        queueId,
        jobType: "send-email",
        payloadJson: {
          to: "demo@relay.dev",
          subject: "child-job"
        },
        status: "QUEUED",
        priority: 5,
        attemptCount: 0,
        maxAttempts: 3,
        availableAt: now
      }
    });

    await prisma.jobDependency.create({
      data: {
        parentJobId: parentJob.id,
        childJobId: childJob.id
      }
    });

    // Before parent completes, child has one dependency and that parent is not completed yet.
    const dependencyBefore = await prisma.jobDependency.findMany({
      where: { childJobId: childJob.id },
      include: {
        parentJob: {
          select: {
            id: true,
            status: true
          }
        }
      }
    });

    expect(dependencyBefore).toHaveLength(1);
    expect(dependencyBefore[0].parentJob.id).toBe(parentJob.id);
    expect(dependencyBefore[0].parentJob.status).toBe("QUEUED");

    const blockedBefore = dependencyBefore.some(
      (dep) => dep.parentJob.status !== "COMPLETED"
    );
    expect(blockedBefore).toBe(true);

    // Parent completes
    await prisma.job.update({
      where: { id: parentJob.id },
      data: {
        status: "COMPLETED",
        completedAt: new Date()
      }
    });

    const dependencyAfter = await prisma.jobDependency.findMany({
      where: { childJobId: childJob.id },
      include: {
        parentJob: {
          select: {
            id: true,
            status: true
          }
        }
      }
    });

    expect(dependencyAfter).toHaveLength(1);
    expect(dependencyAfter[0].parentJob.id).toBe(parentJob.id);
    expect(dependencyAfter[0].parentJob.status).toBe("COMPLETED");

    const blockedAfter = dependencyAfter.some(
      (dep) => dep.parentJob.status !== "COMPLETED"
    );
    expect(blockedAfter).toBe(false);
  });
});