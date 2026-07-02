import "dotenv/config";
import { env } from "@relay/config";
import { prisma } from "@relay/db/src/client";
import { calculateRetryDelayMs, RetryStrategy } from "@relay/shared";

let shuttingDown = false;
let activeExecutions = 0;
let workerId = "";

async function ensureWorker() {
  const existing = await prisma.worker.findUnique({ where: { workerName: env.WORKER_NAME } });
  if (existing) {
    return prisma.worker.update({
      where: { id: existing.id },
      data: { status: "ACTIVE", lastHeartbeatAt: new Date() }
    });
  }
  return prisma.worker.create({
    data: { workerName: env.WORKER_NAME, status: "ACTIVE", lastHeartbeatAt: new Date() }
  });
}

async function heartbeat() {
  if (!workerId) return;
  await prisma.worker.update({
    where: { id: workerId },
    data: { lastHeartbeatAt: new Date() }
  });
}

async function recoverExpiredLeases() {
  await prisma.job.updateMany({
    where: {
      status: { in: ["CLAIMED", "RUNNING"] },
      leaseExpiresAt: { lt: new Date() }
    },
    data: {
      status: "QUEUED",
      claimedByWorkerId: null,
      claimedAt: null,
      leaseExpiresAt: null
    }
  });
}

/**
 * Atomically claims jobs from one queue using PostgreSQL row-level locking.
 *
 * Why this matters:
 * - multiple workers may poll the same queue at the same time
 * - FOR UPDATE SKIP LOCKED prevents two workers from claiming the same job row
 * - the SELECT + UPDATE happen in the same transaction to keep claiming atomic
 *
 * Eligibility rules:
 * - queue must not be paused
 * - job must be QUEUED
 * - availableAt must be due
 * - attemptCount must still be below maxAttempts
 *
 * Claim ordering:
 * - higher priority first
 * - FIFO within same priority via createdAt ASC
 */
async function claimJobs(queueId: string) {
  return prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<{ id: string }[]>`
      SELECT j.id
      FROM "Job" j
      JOIN "Queue" q ON q.id = j."queueId"
      WHERE j."queueId" = ${queueId}
        AND q."isPaused" = false
        AND j.status = 'QUEUED'
        AND j."availableAt" <= now()
        AND j."attemptCount" < j."maxAttempts"
      ORDER BY j.priority DESC, j."createdAt" ASC
      FOR UPDATE SKIP LOCKED
      LIMIT ${env.WORKER_CLAIM_BATCH_SIZE}
    `;

    const ids = rows.map((r) => r.id);
    if (!ids.length) return [];

    await tx.$executeRaw`
      UPDATE "Job"
      SET status = 'CLAIMED',
          "claimedByWorkerId" = ${workerId},
          "leaseExpiresAt" = now() + (${env.WORKER_LEASE_SECONDS} * interval '1 second'),
          "claimedAt" = now()
      WHERE id = ANY(${ids}::uuid[])
    `;

    return tx.job.findMany({
      where: { id: { in: ids } },
      include: { queue: { include: { retryPolicy: true } } }
    });
  });
}

async function runHandler(job: any) {
  if (job.jobType === "fail-demo") {
    throw new Error("Intentional demo failure");
  }
  await new Promise((resolve) => setTimeout(resolve, 500));
}

async function executeJob(job: any) {
  activeExecutions += 1;
  const attempt = job.attemptCount + 1;

  const execution = await prisma.jobExecution.create({
    data: {
      jobId: job.id,
      workerId,
      attemptNumber: attempt,
      status: "RUNNING"
    }
  });

  await prisma.job.update({
    where: { id: job.id },
    data: { status: "RUNNING", attemptCount: attempt }
  });

  try {
    await runHandler(job);

    await prisma.jobExecution.update({
      where: { id: execution.id },
      data: { status: "SUCCEEDED", finishedAt: new Date() }
    });

    await prisma.job.update({
      where: { id: job.id },
      data: {
        status: "COMPLETED",
        completedAt: new Date(),
        leaseExpiresAt: null
      }
    });
  } catch (err: any) {
    await prisma.jobExecution.update({
      where: { id: execution.id },
      data: { status: "FAILED", finishedAt: new Date(), errorMessage: err.message }
    });

    const policy = job.queue.retryPolicy;
    const maxAttempts = policy?.maxAttempts ?? job.maxAttempts ?? 3;

    if (attempt >= maxAttempts) {
      await prisma.job.update({
        where: { id: job.id },
        data: {
          status: "DEAD_LETTER",
          lastError: err.message,
          leaseExpiresAt: null
        }
      });

      await prisma.deadLetterJob.upsert({
        where: { jobId: job.id },
        update: { failureReason: err.message, finalAttempt: attempt },
        create: { jobId: job.id, failureReason: err.message, finalAttempt: attempt }
      });
    } else {
      const delay = calculateRetryDelayMs(
        (policy?.strategy as RetryStrategy) || RetryStrategy.EXPONENTIAL,
        policy?.baseDelayMs || 5000,
        attempt
      );

      await prisma.job.update({
        where: { id: job.id },
        data: {
          status: "QUEUED",
          availableAt: new Date(Date.now() + delay),
          lastError: err.message,
          claimedByWorkerId: null,
          claimedAt: null,
          leaseExpiresAt: null
        }
      });
    }
  } finally {
    activeExecutions -= 1;
  }
}

async function poll() {
  if (shuttingDown) return;

  await recoverExpiredLeases();

  const queues = await prisma.queue.findMany({
    where: { isPaused: false },
    include: { retryPolicy: true }
  });

  for (const queue of queues) {
    if (shuttingDown) return;

    const jobs = await claimJobs(queue.id);
    if (!jobs.length) continue;

    await Promise.all(jobs.map((job) => executeJob(job)));
  }
}

async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`Received ${signal}. Worker entering DRAINING mode...`);

  if (workerId) {
    await prisma.worker.update({
      where: { id: workerId },
      data: { status: "DRAINING" }
    });
  }

  const waitStart = Date.now();
  while (activeExecutions > 0 && Date.now() - waitStart < 15000) {
    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  if (workerId) {
    await prisma.worker.update({
      where: { id: workerId },
      data: { status: "STOPPED", lastHeartbeatAt: new Date() }
    });
  }

  await prisma.$disconnect();
  process.exit(0);
}

async function main() {
  const worker = await ensureWorker();
  workerId = worker.id;

  setInterval(() => {
    if (!shuttingDown) heartbeat();
  }, env.WORKER_HEARTBEAT_INTERVAL_MS);

  setInterval(() => {
    if (!shuttingDown) poll();
  }, env.WORKER_POLL_INTERVAL_MS);

  console.log("Worker started:", worker.workerName);
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
