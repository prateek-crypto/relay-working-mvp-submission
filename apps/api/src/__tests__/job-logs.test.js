import { beforeEach, afterAll, describe, expect, it } from "vitest";
import { prisma } from "@relay/db";
import { cleanupTestData } from "./test-helpers.js";
describe("Job logs", () => {
    const queueId = "00000000-0000-0000-0000-000000000101";
    beforeEach(async () => {
        await cleanupTestData();
    });
    afterAll(async () => {
        await prisma.$disconnect();
    });
    it("stores lifecycle logs for a job", async () => {
        const job = await prisma.job.create({
            data: {
                queueId,
                jobType: "send-email",
                payloadJson: { to: "demo@relay.dev", subject: "log-test" },
                status: "QUEUED",
                priority: 5,
                attemptCount: 0,
                maxAttempts: 3,
                availableAt: new Date()
            }
        });
        await prisma.jobLog.createMany({
            data: [
                {
                    jobId: job.id,
                    level: "INFO",
                    event: "CLAIMED",
                    message: "Job claimed by worker worker-1",
                    metadataJson: {
                        workerName: "worker-1"
                    }
                },
                {
                    jobId: job.id,
                    level: "INFO",
                    event: "STARTED",
                    message: "Job execution started",
                    metadataJson: {
                        attempt: 1
                    }
                },
                {
                    jobId: job.id,
                    level: "INFO",
                    event: "COMPLETED",
                    message: "Job completed successfully",
                    metadataJson: {
                        durationMs: 1000
                    }
                }
            ]
        });
        const logs = await prisma.jobLog.findMany({
            where: { jobId: job.id },
            orderBy: { createdAt: "asc" }
        });
        expect(logs).toHaveLength(3);
        expect(logs[0].event).toBe("CLAIMED");
        expect(logs[1].event).toBe("STARTED");
        expect(logs[2].event).toBe("COMPLETED");
    });
});
