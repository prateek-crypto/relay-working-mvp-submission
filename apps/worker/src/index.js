import "dotenv/config";
import { env } from "@relay/config";
import { prisma } from "@relay/db";
import { calculateRetryDelayMs, RetryStrategy } from "@relay/shared";
let shuttingDown = false;
let activeExecutions = 0;
let workerId = "";
function toInputJson(value) {
    if (value === undefined || value === null)
        return undefined;
    return value;
}
// Minimal cron next-run calculator for common 5-field cron expressions.
// Supported examples:
// */5 * * * *
// */10 * * * *
// 0 * * * *
// 30 14 * * *
function computeNextRunFromCron(cronExpression, from) {
    const parts = cronExpression.trim().split(/\s+/);
    if (parts.length !== 5) {
        throw new Error(`Unsupported cron format: ${cronExpression}`);
    }
    const [minutePart, hourPart, dayPart, monthPart, weekdayPart] = parts;
    if (dayPart !== "*" || monthPart !== "*" || weekdayPart !== "*") {
        throw new Error(`Only wildcard day/month/weekday cron expressions are supported in this MVP: ${cronExpression}`);
    }
    const base = new Date(from);
    base.setSeconds(0, 0);
    // */N * * * *
    if (minutePart.startsWith("*/") && hourPart === "*") {
        const step = Number(minutePart.slice(2));
        if (!Number.isFinite(step) || step <= 0) {
            throw new Error(`Invalid cron step in ${cronExpression}`);
        }
        const next = new Date(base);
        next.setMinutes(next.getMinutes() + 1);
        while (next.getMinutes() % step !== 0) {
            next.setMinutes(next.getMinutes() + 1);
        }
        next.setSeconds(0, 0);
        return next;
    }
    // M * * * *
    if (/^\d+$/.test(minutePart) && hourPart === "*") {
        const minute = Number(minutePart);
        if (minute < 0 || minute > 59) {
            throw new Error(`Invalid minute in ${cronExpression}`);
        }
        const next = new Date(base);
        next.setSeconds(0, 0);
        if (next.getMinutes() < minute ||
            (next.getMinutes() === minute &&
                from.getSeconds() === 0 &&
                from.getMilliseconds() === 0)) {
            next.setMinutes(minute, 0, 0);
            if (next <= from) {
                next.setHours(next.getHours() + 1);
                next.setMinutes(minute, 0, 0);
            }
        }
        else {
            next.setHours(next.getHours() + 1);
            next.setMinutes(minute, 0, 0);
        }
        return next;
    }
    // M H * * *
    if (/^\d+$/.test(minutePart) && /^\d+$/.test(hourPart)) {
        const minute = Number(minutePart);
        const hour = Number(hourPart);
        if (minute < 0 || minute > 59 || hour < 0 || hour > 23) {
            throw new Error(`Invalid hour/minute in ${cronExpression}`);
        }
        const next = new Date(base);
        next.setHours(hour, minute, 0, 0);
        if (next <= from) {
            next.setDate(next.getDate() + 1);
            next.setHours(hour, minute, 0, 0);
        }
        return next;
    }
    throw new Error(`Unsupported cron expression for MVP: ${cronExpression}`);
}
async function logJobEvent(params) {
    await prisma.jobLog.create({
        data: {
            jobId: params.jobId,
            event: params.event,
            level: params.level ?? "INFO",
            message: params.message,
            metadataJson: toInputJson(params.metadata)
        }
    });
}
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
async function heartbeat() {
    if (!workerId)
        return;
    await prisma.worker.update({
        where: { id: workerId },
        data: {
            status: "ACTIVE",
            lastHeartbeatAt: new Date()
        }
    });
}
/**
 * Promote one-time scheduled jobs into runnable queue jobs.
 * SCHEDULED -> QUEUED when availableAt becomes due.
 */
async function promoteScheduledJobs() {
    const now = new Date();
    const scheduledJobs = await prisma.job.findMany({
        where: {
            status: "SCHEDULED",
            availableAt: { lte: now }
        }
    });
    if (!scheduledJobs.length)
        return;
    for (const job of scheduledJobs) {
        await prisma.job.update({
            where: { id: job.id },
            data: { status: "QUEUED" }
        });
        await logJobEvent({
            jobId: job.id,
            event: "SCHEDULED_PROMOTED",
            level: "INFO",
            message: "Scheduled job became due and was promoted to QUEUED",
            metadata: {
                previousStatus: "SCHEDULED",
                newStatus: "QUEUED",
                availableAt: job.availableAt.toISOString()
            }
        });
    }
    console.log(`[worker] promoted ${scheduledJobs.length} scheduled job(s) to QUEUED`);
}
/**
 * Materialize recurring ScheduledJob definitions into runnable Job rows.
 *
 * Catch-up policy:
 * - if a recurring schedule is overdue, enqueue exactly one runnable job now
 * - then move nextRunAt forward until it becomes future-facing
 * - do not enqueue every missed interval after downtime
 */
async function materializeRecurringJobs() {
    const now = new Date();
    const dueSchedules = await prisma.scheduledJob.findMany({
        where: {
            isPaused: false,
            nextRunAt: { lte: now }
        },
        orderBy: { nextRunAt: "asc" }
    });
    if (!dueSchedules.length)
        return;
    for (const schedule of dueSchedules) {
        const createdJob = await prisma.job.create({
            data: {
                queueId: schedule.queueId,
                jobType: schedule.jobType,
                payloadJson: toInputJson(schedule.payloadJson) ?? {},
                status: "QUEUED",
                priority: schedule.priority,
                attemptCount: 0,
                maxAttempts: schedule.maxAttempts,
                availableAt: new Date(),
                sourceScheduledJobId: schedule.id
            }
        });
        let nextRunAt = schedule.nextRunAt;
        try {
            do {
                nextRunAt = computeNextRunFromCron(schedule.cronExpression, nextRunAt);
            } while (nextRunAt <= now);
        }
        catch (err) {
            console.error(`[worker] failed to compute next cron run for schedule ${schedule.id}:`, err);
            // safe fallback so the schedule does not get stuck forever
            nextRunAt = new Date(Date.now() + 5 * 60 * 1000);
        }
        await prisma.scheduledJob.update({
            where: { id: schedule.id },
            data: {
                lastEnqueuedAt: now,
                nextRunAt
            }
        });
        await logJobEvent({
            jobId: createdJob.id,
            event: "RECURRING_MATERIALIZED",
            level: "INFO",
            message: "Recurring schedule materialized into a runnable job",
            metadata: {
                scheduledJobId: schedule.id,
                scheduleName: schedule.name,
                cronExpression: schedule.cronExpression,
                previousNextRunAt: schedule.nextRunAt.toISOString(),
                nextRunAt: nextRunAt.toISOString(),
                catchUpPolicy: "skip_backlog_enqueue_only_one_due_run"
            }
        });
        console.log(`[worker] materialized recurring job from schedule ${schedule.id} -> next run at ${nextRunAt.toISOString()}`);
    }
}
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
 * Check whether a job is runnable based on workflow dependencies.
 * A child job can run only if all parent jobs are COMPLETED.
 */
async function canRunJob(jobId) {
    const deps = await prisma.jobDependency.findMany({
        where: { childJobId: jobId },
        include: {
            parentJob: {
                select: {
                    id: true,
                    status: true
                }
            }
        }
    });
    if (!deps.length) {
        return { ok: true, blockedParentIds: [] };
    }
    const blockedParentIds = deps
        .filter((dep) => dep.parentJob.status !== "COMPLETED")
        .map((dep) => dep.parentJob.id);
    return {
        ok: blockedParentIds.length === 0,
        blockedParentIds
    };
}
/**
 * Compute how many jobs may be claimed from a queue after applying queue-level rate limits.
 * If no rate limit is configured, returns the concurrency-based capacity unchanged.
 */
async function computeRateLimitedCapacity(queue, baseCapacity) {
    if (!queue.rateLimitCount ||
        !queue.rateLimitWindowSec ||
        queue.rateLimitCount <= 0 ||
        queue.rateLimitWindowSec <= 0) {
        return {
            allowedCapacity: baseCapacity,
            rateLimitApplied: false,
            usedInWindow: 0
        };
    }
    const windowStart = new Date(Date.now() - queue.rateLimitWindowSec * 1000);
    const usedInWindow = await prisma.jobExecution.count({
        where: {
            job: {
                queueId: queue.id
            },
            startedAt: {
                gte: windowStart
            }
        }
    });
    const remainingRateCapacity = Math.max(0, queue.rateLimitCount - usedInWindow);
    return {
        allowedCapacity: Math.min(baseCapacity, remainingRateCapacity),
        rateLimitApplied: true,
        usedInWindow
    };
}
async function claimJobs(queueId) {
    const now = new Date();
    const queue = await prisma.queue.findUnique({
        where: { id: queueId },
        include: { retryPolicy: true }
    });
    if (!queue || queue.isPaused) {
        return [];
    }
    const currentlyActive = await prisma.job.count({
        where: {
            queueId,
            status: { in: ["CLAIMED", "RUNNING"] }
        }
    });
    const remainingConcurrencyCapacity = Math.max(0, queue.concurrencyLimit - currentlyActive);
    if (remainingConcurrencyCapacity <= 0) {
        return [];
    }
    const rateLimited = await computeRateLimitedCapacity(queue, remainingConcurrencyCapacity);
    if (rateLimited.allowedCapacity <= 0) {
        console.log(`[worker] queue ${queueId} skipped due to rate limit (used=${rateLimited.usedInWindow}/${queue.rateLimitCount} in ${queue.rateLimitWindowSec}s window)`);
        return [];
    }
    const takeCount = Math.min(rateLimited.allowedCapacity, env.WORKER_CLAIM_BATCH_SIZE);
    const jobs = await prisma.job.findMany({
        where: {
            queueId,
            status: "QUEUED",
            availableAt: { lte: now }
        },
        orderBy: [{ priority: "desc" }, { createdAt: "asc" }],
        take: takeCount * 3 // fetch extra so blocked dependency jobs don't waste the batch
    });
    const claimed = [];
    for (const job of jobs) {
        if (claimed.length >= takeCount) {
            break;
        }
        const dependencyCheck = await canRunJob(job.id);
        if (!dependencyCheck.ok) {
            await logJobEvent({
                jobId: job.id,
                event: "BLOCKED_BY_DEPENDENCY",
                level: "WARN",
                message: "Job is waiting for parent dependency completion",
                metadata: {
                    blockedParentIds: dependencyCheck.blockedParentIds
                }
            });
            continue;
        }
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
            await logJobEvent({
                jobId: job.id,
                event: "CLAIMED",
                level: "INFO",
                message: `Job claimed by worker ${env.WORKER_NAME}`,
                metadata: {
                    workerId,
                    workerName: env.WORKER_NAME,
                    queueId,
                    claimedAt: now.toISOString()
                }
            });
        }
    }
    if (claimed.length > 0) {
        console.log(`[worker] claimed ${claimed.length} job(s) from queue ${queueId} (active=${currentlyActive}, limit=${queue.concurrencyLimit}${rateLimited.rateLimitApplied
            ? `, rateUsed=${rateLimited.usedInWindow}/${queue.rateLimitCount}`
            : ""}): ${claimed.map((j) => j.id).join(", ")}`);
    }
    return claimed;
}
async function runHandler(job) {
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
async function executeJob(job) {
    activeExecutions += 1;
    const attempt = job.attemptCount + 1;
    const startedAt = new Date();
    console.log(`[worker] executing job ${job.id} | type=${job.jobType} | attempt=${attempt}`);
    let execution;
    try {
        execution = await prisma.jobExecution.create({
            data: {
                jobId: job.id,
                workerId,
                attemptNumber: attempt,
                status: "RUNNING",
                startedAt
            }
        });
        await prisma.job.update({
            where: { id: job.id },
            data: {
                status: "RUNNING",
                attemptCount: attempt
            }
        });
        await logJobEvent({
            jobId: job.id,
            event: "STARTED",
            level: "INFO",
            message: `Job execution started (attempt ${attempt})`,
            metadata: {
                workerId,
                workerName: env.WORKER_NAME,
                attempt,
                startedAt: startedAt.toISOString()
            }
        });
        await runHandler(job);
        const finishedAt = new Date();
        const durationMs = finishedAt.getTime() - startedAt.getTime();
        if (!execution) {
            throw new Error(`Execution row missing for job ${job.id}`);
        }
        await prisma.jobExecution.update({
            where: { id: execution.id },
            data: {
                status: "SUCCEEDED",
                finishedAt,
                durationMs,
                errorMessage: null
            }
        });
        await prisma.job.update({
            where: { id: job.id },
            data: {
                status: "COMPLETED",
                completedAt: finishedAt,
                lastError: null,
                leaseExpiresAt: null,
                claimedByWorkerId: null,
                claimedAt: null
            }
        });
        await logJobEvent({
            jobId: job.id,
            event: "COMPLETED",
            level: "INFO",
            message: `Job completed successfully in ${durationMs} ms`,
            metadata: {
                workerId,
                workerName: env.WORKER_NAME,
                attempt,
                durationMs,
                completedAt: finishedAt.toISOString()
            }
        });
        console.log(`[worker] job completed: ${job.id}`);
    }
    catch (err) {
        const errorMessage = err instanceof Error ? err.message : "Unknown worker execution error";
        const finishedAt = new Date();
        const durationMs = finishedAt.getTime() - startedAt.getTime();
        console.error(`[worker] job failed: ${job.id} | ${errorMessage}`);
        if (execution) {
            await prisma.jobExecution.update({
                where: { id: execution.id },
                data: {
                    status: "FAILED",
                    finishedAt,
                    durationMs,
                    errorMessage
                }
            });
        }
        await logJobEvent({
            jobId: job.id,
            event: "FAILED",
            level: "ERROR",
            message: `Job execution failed on attempt ${attempt}: ${errorMessage}`,
            metadata: {
                workerId,
                workerName: env.WORKER_NAME,
                attempt,
                durationMs,
                errorMessage,
                failedAt: finishedAt.toISOString()
            }
        });
        const policy = job.queue?.retryPolicyId
            ? await prisma.retryPolicy.findUnique({
                where: {
                    id: job.queue.retryPolicyId
                }
            })
            : null;
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
            await logJobEvent({
                jobId: job.id,
                event: "DEAD_LETTER",
                level: "ERROR",
                message: `Job moved to dead letter after attempt ${attempt}`,
                metadata: {
                    workerId,
                    workerName: env.WORKER_NAME,
                    attempt,
                    maxAttempts,
                    errorMessage
                }
            });
            console.log(`[worker] job moved to DEAD_LETTER: ${job.id}`);
        }
        else {
            const delay = calculateRetryDelayMs(policy?.strategy || RetryStrategy.EXPONENTIAL, policy?.baseDelayMs || 5000, attempt);
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
            await logJobEvent({
                jobId: job.id,
                event: "RETRY_SCHEDULED",
                level: "WARN",
                message: `Retry scheduled for attempt ${attempt + 1}`,
                metadata: {
                    workerId,
                    workerName: env.WORKER_NAME,
                    attempt,
                    nextAttempt: attempt + 1,
                    nextAvailableAt: nextAvailableAt.toISOString(),
                    delayMs: delay,
                    errorMessage
                }
            });
        }
    }
    finally {
        activeExecutions -= 1;
    }
}
async function poll() {
    if (shuttingDown)
        return;
    await promoteScheduledJobs();
    await materializeRecurringJobs();
    await recoverExpiredLeases();
    const queues = await prisma.queue.findMany({
        where: { isPaused: false }
    });
    for (const queue of queues) {
        if (shuttingDown)
            return;
        const jobs = await claimJobs(queue.id);
        if (!jobs.length)
            continue;
        await Promise.all(jobs.map((job) => executeJob(job)));
    }
}
async function shutdown(signal) {
    if (shuttingDown)
        return;
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
    }
    catch (err) {
        console.error("[worker] shutdown error:", err);
    }
    finally {
        await prisma.$disconnect();
        process.exit(0);
    }
}
async function main() {
    const worker = await ensureWorker();
    workerId = worker.id;
    console.log(`[worker] started: ${worker.workerName}`);
    await poll();
    setInterval(() => {
        if (!shuttingDown) {
            heartbeat().catch((err) => console.error("[worker] heartbeat failed:", err));
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
