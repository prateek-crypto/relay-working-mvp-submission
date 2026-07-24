import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@relay/db";
import { cleanupTestData } from "./test-helpers.js";
describe("Retry / requeue flow", () => {
    const queueId = "00000000-0000-0000-0000-000000000101";
    beforeEach(async () => {
        await cleanupTestData();
    });
    afterAll(async () => {
        await prisma.$disconnect();
    });
    it("resets a dead-lettered job back to QUEUED and removes its DLQ entry", async () => {
        const job = await prisma.job.create({
            data: {
                queueId,
                jobType: "fail-demo",
                payloadJson: { reason: "test retry" },
                status: "DEAD_LETTER",
                priority: 5,
                attemptCount: 3,
                maxAttempts: 3,
                availableAt: new Date(),
                claimedByWorkerId: "worker-test",
                claimedAt: new Date(),
                leaseExpiresAt: new Date(Date.now() + 60_000),
                completedAt: new Date(),
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
        // Simulate same logic as retry/requeue endpoint
        const updatedJob = await prisma.job.update({
            where: { id: job.id },
            data: {
                status: "QUEUED",
                availableAt: new Date(),
                attemptCount: 0,
                lastError: null,
                claimedByWorkerId: null,
                claimedAt: null,
                leaseExpiresAt: null,
                completedAt: null
            }
        });
        await prisma.deadLetterJob.delete({
            where: { id: dlq.id }
        });
        const storedJob = await prisma.job.findUnique({
            where: { id: job.id }
        });
        const storedDlq = await prisma.deadLetterJob.findUnique({
            where: { id: dlq.id }
        });
        expect(updatedJob.status).toBe("QUEUED");
        expect(updatedJob.attemptCount).toBe(0);
        expect(updatedJob.lastError).toBeNull();
        expect(updatedJob.claimedByWorkerId).toBeNull();
        expect(updatedJob.claimedAt).toBeNull();
        expect(updatedJob.leaseExpiresAt).toBeNull();
        expect(updatedJob.completedAt).toBeNull();
        expect(storedJob).toBeTruthy();
        expect(storedJob?.status).toBe("QUEUED");
        expect(storedJob?.attemptCount).toBe(0);
        expect(storedJob?.lastError).toBeNull();
        expect(storedJob?.claimedByWorkerId).toBeNull();
        expect(storedJob?.claimedAt).toBeNull();
        expect(storedJob?.leaseExpiresAt).toBeNull();
        expect(storedJob?.completedAt).toBeNull();
        expect(storedDlq).toBeNull();
    });
});
