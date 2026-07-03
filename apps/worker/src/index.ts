import "dotenv/config";
import { env } from "@relay/config";
import { prisma } from "@relay/db";
import { calculateRetryDelayMs, RetryStrategy } from "@relay/shared";

let shuttingDown = false;
let activeExecutions = 0;
let workerId = "";

type QueueWithPolicy = Awaited<
  ReturnType<
    typeof prisma.queue.findUnique<{
      where: { id: string };
      include: { retryPolicy: true };
    }>
  >
>;

type ClaimedJob = Array<
  Awaited<ReturnType<typeof prisma.job.findMany>>[number] & {
    queue: NonNullable<QueueWithPolicy>;
  }
>[number];

/**
 * Ensure this worker exists in DB and is marked ACTIVE.
 */
async function ensureWorker() {
  const existing = await prisma.worker.findUnique({
    where: { workerName: env.WORKER_NAME }
  });

  if (existing) {
    return prisma.worker.update({
      where: { id: existing.id },
      data: {
        status: "ACTIVE",
        lastHeartbeatAt: new Date()
      }
    });
  }

  return prisma.worker.create({
    data: {
      workerName: env.WORKER_NAME,
      status: "ACTIVE",
      lastHeartbeatAt: new Date()
    }
  });
}

/**
 * Periodic worker heartbeat.
 */
async function heartbeat() {
  if (!workerId) return;

  await prisma.worker.update({
    where: { id: workerId },
    data: {
      status: "ACTIVE",
      lastHeartbeatAt: new Date()
    }
  });
}

/**
 * Recover jobs whose lease expired while in CLAIMED/RUNNING.
 */
async function recoverExpiredLeases() {
  const result = await prisma.job.updateMany({
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

  if (result.count > 0) {
    console.log(`[worker] recovered ${result.count} expired leased job(s)`);
  }
}

/**
 * Claim ready jobs from a queue.
 */
async function claimJobs(queueId: string): Promise<ClaimedJob[]> {
  const now = new Date();

  const queue = await prisma.queue.findUnique({
    where: { id: queueId },
    include: { retryPolicy: true }
  });

  if (!queue || queue.isPaused) {
    return [];
  }

  const jobs = await prisma.job.findMany({
    where: {
      queueId,
      status: "QUEUED",
      availableAt: { lte: now }
    },
    orderBy: [{ priority: "desc" }, { createdAt: "asc" }],
    take: env.WORKER_CLAIM_BATCH_SIZE
  });

  const claimed: ClaimedJob[] = [];

  for (const job of jobs) {
    const updated = await prisma.job.updateMany({
      where: {
        id: job.id,
        status: "QUEUED"
      },
      data: {
        status: "CLAIMED",
        claimedByWorkerId: workerId,
        claimedAt: now,
        leaseExpiresAt: new Date(Date.now() + env.WORKER_LEASE_SECONDS * 1000)
      }
    });

    if (updated.count === 1) {
      claimed.push({
        ...job,
        queue
      });
    }
  }

  if (claimed.length > 0) {
    console.log(
      `[worker] claimed ${claimed.length} job(s) from queue ${queueId}: ${claimed
        .map((j) => j.id)
        .join(", ")}`
    );
  }

  return claimed;
}

/**
 * Demo handler.
 */
async function runHandler(job: { id: string; jobType: string }) {
  switch (job.jobType) {
    case "send-email":
      await new Promise((resolve) => setTimeout(resolve, 500));
      return;

    case "generate-report":
      await new Promise((resolve) => setTimeout(resolve, 1000));
      return;

    case "fail-demo":
      await new Promise((resolve) => setTimeout(resolve, 300));
      throw new Error("Intentional demo failure");

    default:
      throw new Error(`Unknown job type: ${job.jobType}`);
  }
}

/**
 * Execute one claimed job.
 */
async function executeJob(job: ClaimedJob) {
  activeExecutions += 1;
  const attempt = job.attemptCount + 1;

  console.log(
    `[worker] executing job ${job.id} | type=${job.jobType} | attempt=${attempt}`
  );

  let execution:
    | {
        id: string;
      }
    | undefined;

  try {
    execution = await prisma.jobExecution.create({
      data: {
        jobId: job.id,
        workerId,
        attemptNumber: attempt,
        status: "RUNNING",
        startedAt: new Date()
      }
    });

    await prisma.job.update({
      where: { id: job.id },
      data: {
        status: "RUNNING",
        attemptCount: attempt
      }
    });

    await runHandler(job);

    await prisma.jobExecution.update({
      where: { id: execution.id },
      data: {
        status: "SUCCEEDED",
        finishedAt: new Date(),
        errorMessage: null
      }
    });

    await prisma.job.update({
      where: { id: job.id },
      data: {
        status: "COMPLETED",
        completedAt: new Date(),
        lastError: null,
        leaseExpiresAt: null,
        claimedByWorkerId: null,
        claimedAt: null
      }
    });

    console.log(`[worker] job completed: ${job.id}`);
  } catch (err: unknown) {
    const errorMessage =
      err instanceof Error ? err.message : "Unknown worker execution error";

    console.error(`[worker] job failed: ${job.id} | ${errorMessage}`);

    if (execution) {
      await prisma.jobExecution.update({
        where: { id: execution.id },
        data: {
          status: "FAILED",
          finishedAt: new Date(),
          errorMessage
        }
      });
    }

    let policy = null;
    if (job.queue?.retryPolicyId) {
      policy = await prisma.retryPolicy.findUnique({
        where: { id: job.queue.retryPolicyId }
      });
    }

    const maxAttempts = policy?.maxAttempts ?? job.maxAttempts ?? 3;

    if (attempt >= maxAttempts) {
      await prisma.job.update({
        where: { id: job.id },
        data: {
          status: "DEAD_LETTER",
          lastError: errorMessage,
          leaseExpiresAt: null,
          claimedByWorkerId: null,
          claimedAt: null
        }
      });

      await prisma.deadLetterJob.upsert({
        where: { jobId: job.id },
        update: {
          failureReason: errorMessage,
          finalAttempt: attempt
        },
        create: {
          jobId: job.id,
          failureReason: errorMessage,
          finalAttempt: attempt
        }
      });

      console.log(`[worker] job moved to DEAD_LETTER: ${job.id}`);
    } else {
      const delay = calculateRetryDelayMs(
        (policy?.strategy as RetryStrategy) || RetryStrategy.EXPONENTIAL,
        policy?.baseDelayMs || 5000,
        attempt
      );

      const nextAvailableAt = new Date(Date.now() + delay);

      await prisma.job.update({
        where: { id: job.id },
        data: {
          status: "QUEUED",
          availableAt: nextAvailableAt,
          lastError: errorMessage,
          leaseExpiresAt: null,
          claimedByWorkerId: null,
          claimedAt: null
        }
      });
    }
  } finally {
    activeExecutions -= 1;
  }
}

/**
 * One poll cycle.
 */
async function poll() {
  if (shuttingDown) return;

  await recoverExpiredLeases();

  const queues = await prisma.queue.findMany({
    where: { isPaused: false }
  });

  for (const queue of queues) {
    if (shuttingDown) return;

    const jobs = await claimJobs(queue.id);
    if (!jobs.length) continue;

    await Promise.all(jobs.map((job) => executeJob(job)));
  }
}

/**
 * Graceful shutdown.
 */
async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;

  console.log(`[worker] received ${signal}, draining worker...`);

  try {
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
        data: {
          status: "STOPPED",
          lastHeartbeatAt: new Date()
        }
      });
    }
  } catch (err) {
    console.error("[worker] shutdown error:", err);
  } finally {
    await prisma.$disconnect();
    process.exit(0);
  }
}

/**
 * Main boot flow.
 */
async function main() {
  const worker = await ensureWorker();
  workerId = worker.id;

  console.log(`[worker] started: ${worker.workerName}`);

  await poll();

  setInterval(() => {
    if (!shuttingDown) {
      heartbeat().catch((err) =>
        console.error("[worker] heartbeat failed:", err)
      );
    }
  }, env.WORKER_HEARTBEAT_INTERVAL_MS);

  setInterval(() => {
    if (!shuttingDown) {
      poll().catch((err) => console.error("[worker] poll failed:", err));
    }
  }, env.WORKER_POLL_INTERVAL_MS);
}

process.on("SIGINT", () => {
  shutdown("SIGINT").catch((err) => {
    console.error("[worker] shutdown failure:", err);
    process.exit(1);
  });
});

process.on("SIGTERM", () => {
  shutdown("SIGTERM").catch((err) => {
    console.error("[worker] shutdown failure:", err);
    process.exit(1);
  });
});

main().catch(async (err) => {
  console.error("[worker] failed to start:", err);
  await prisma.$disconnect();
  process.exit(1);
});