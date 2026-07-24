import "dotenv/config";
import express, {
  type Request,
  type Response,
  type NextFunction
} from "express";
import cors from "cors";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { z, ZodError } from "zod";
import { env } from "@relay/config";
import { prisma } from "@relay/db";

const app = express();

app.use(cors());
app.use(express.json());
app.get("/", (_req: Request, res: Response) => {
  res.json({
    service: "Relay API",
    status: "running",
    version: "1.0.0"
  });
});
type JwtUser = {
  userId: string;
  email: string;
  iat?: number;
  exp?: number;
};

type AuthedRequest<
  P extends Record<string, string> = Record<string, string>
> = Request<P> & {
  user?: JwtUser;
};

function auth(req: AuthedRequest, res: Response, next: NextFunction) {
  const h = req.headers.authorization;

  if (!h?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Missing token" });
  }

  try {
    req.user = jwt.verify(
      h.replace("Bearer ", "").trim(),
      env.JWT_SECRET
    ) as JwtUser;
    return next();
  } catch {
    return res.status(401).json({ error: "Invalid token" });
  }
}

function handleRouteError(
  res: Response,
  err: unknown,
  fallbackMessage: string
) {
  if (err instanceof ZodError) {
    return res.status(400).json({
      error: "Validation failed",
      details: err.flatten()
    });
  }

  console.error(fallbackMessage, err);
  return res.status(500).json({ error: fallbackMessage });
}

function parsePagination(query: Request["query"]) {
  const page = Math.max(1, Number(query.page ?? 1));
  const pageSize = Math.min(100, Math.max(1, Number(query.pageSize ?? 20)));

  return {
    page,
    pageSize,
    skip: (page - 1) * pageSize,
    take: pageSize
  };
}

function computeJobSchedule(params: {
  delaySeconds?: number;
  runAt?: Date;
}) {
  if (params.runAt) {
    return {
      status: "SCHEDULED" as const,
      availableAt: params.runAt
    };
  }

  if (params.delaySeconds && params.delaySeconds > 0) {
    return {
      status: "SCHEDULED" as const,
      availableAt: new Date(Date.now() + params.delaySeconds * 1000)
    };
  }

  return {
    status: "QUEUED" as const,
    availableAt: new Date()
  };
}

const singleJobSchema = z
  .object({
    name: z.string().min(1).max(120).optional(),
    jobType: z.enum(["send-email", "generate-report", "fail-demo"]),
    payload: z.record(z.any()),
    priority: z.number().int().min(1).max(100).optional(),
    maxAttempts: z.number().int().min(1).max(20).optional(),
    delaySeconds: z.number().int().min(1).optional(),
    runAt: z.coerce.date().optional(),
    cronExpression: z.string().min(5).optional(),
    timezone: z.string().min(1).optional()
  })
  .superRefine((value, ctx) => {
    const modes = [
      value.delaySeconds ? 1 : 0,
      value.runAt ? 1 : 0,
      value.cronExpression ? 1 : 0
    ].reduce((a, b) => a + b, 0);

    if (modes > 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "Use only one scheduling mode per request: delaySeconds, runAt, or cronExpression"
      });
    }

    if (value.cronExpression && value.runAt) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Recurring scheduled jobs cannot also specify runAt"
      });
    }

    if (value.cronExpression && value.delaySeconds) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Recurring scheduled jobs cannot also specify delaySeconds"
      });
    }
  });

const batchJobItemSchema = z
  .object({
    jobType: z.enum(["send-email", "generate-report", "fail-demo"]),
    payload: z.record(z.any()),
    priority: z.number().int().min(1).max(100).optional(),
    maxAttempts: z.number().int().min(1).max(20).optional(),
    delaySeconds: z.number().int().min(1).optional(),
    runAt: z.coerce.date().optional()
  })
  .superRefine((value, ctx) => {
    if (value.delaySeconds && value.runAt) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Batch item can use either delaySeconds or runAt, not both"
      });
    }
  });

/**
 * New schemas for backend gap-closure phase 1
 */

const createProjectSchema = z.object({
  name: z.string().min(1).max(120),
  slug: z
    .string()
    .min(2)
    .max(80)
    .regex(/^[a-z0-9-]+$/, "Slug must contain only lowercase letters, numbers, and hyphens")
});

const createQueueSchema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(500).nullable().optional(),
  defaultPriority: z.number().int().min(1).max(100).optional(),
  concurrencyLimit: z.number().int().min(1).max(100).optional(),
  retryPolicyId: z.string().uuid().nullable().optional(),
  rateLimitCount: z.number().int().min(1).optional(),
  rateLimitWindowSec: z.number().int().min(1).optional()
});

const updateQueueSchema = z
  .object({
    name: z.string().min(1).max(120).optional(),
    description: z.string().max(500).nullable().optional(),
    defaultPriority: z.number().int().min(1).max(100).optional(),
    concurrencyLimit: z.number().int().min(1).max(100).optional(),
    retryPolicyId: z.string().uuid().nullable().optional(),
    rateLimitCount: z.number().int().min(1).nullable().optional(),
    rateLimitWindowSec: z.number().int().min(1).nullable().optional(),
    isPaused: z.boolean().optional()
  })
  .superRefine((value, ctx) => {
    const hasRateLimitCount = value.rateLimitCount !== undefined;
    const hasRateLimitWindowSec = value.rateLimitWindowSec !== undefined;

    if (hasRateLimitCount !== hasRateLimitWindowSec) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "rateLimitCount and rateLimitWindowSec must be provided together when updating rate limits"
      });
    }
  });

const updateScheduledJobSchema = z
  .object({
    name: z.string().min(1).max(120).nullable().optional(),
    payload: z.record(z.any()).optional(),
    priority: z.number().int().min(1).max(100).optional(),
    maxAttempts: z.number().int().min(1).max(20).optional(),
    cronExpression: z.string().min(5).optional(),
    timezone: z.string().min(1).nullable().optional(),
    isPaused: z.boolean().optional()
  })
  .refine(
    (value) => Object.keys(value).length > 0,
    "At least one field must be provided for scheduled job update"
  );

app.get("/health", (_req: Request, res: Response) => {
  res.json({ ok: true });
});

app.post("/api/v1/auth/login", async (req: Request, res: Response) => {
  try {
    const body = z
      .object({
        email: z.string().email(),
        password: z.string().min(6)
      })
      .parse(req.body);

    const user = await prisma.user.findUnique({
      where: { email: body.email }
    });

    if (!user) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const ok = await bcrypt.compare(body.password, user.passwordHash);
    if (!ok) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const token = jwt.sign(
      { userId: user.id, email: user.email },
      env.JWT_SECRET,
      { expiresIn: env.JWT_EXPIRES_IN as any }
    );

    return res.json({
      token,
      user: { id: user.id, email: user.email, name: user.name }
    });
  } catch (err) {
    return handleRouteError(res, err, "Login failed");
  }
});

app.get("/api/v1/projects", auth, async (req: AuthedRequest, res: Response) => {
  try {
    const { page, pageSize, skip, take } = parsePagination(req.query);

    const [total, items] = await Promise.all([
      prisma.project.count(),
      prisma.project.findMany({
        orderBy: { name: "asc" },
        skip,
        take
      })
    ]);

    return res.json({
      items,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize)
      }
    });
  } catch (err) {
    return handleRouteError(res, err, "Failed to load projects");
  }
});

/**
 * NEW: Create project
 */
app.post("/api/v1/projects", auth, async (req: AuthedRequest, res: Response) => {
  try {
    const body = createProjectSchema.parse(req.body);

    const existing = await prisma.project.findUnique({
      where: { slug: body.slug }
    });

    if (existing) {
      return res.status(409).json({ error: "Project slug already exists" });
    }

    const project = await prisma.project.create({
      data: {
        name: body.name,
        slug: body.slug
      }
    });

    return res.status(201).json(project);
  } catch (err) {
    return handleRouteError(res, err, "Failed to create project");
  }
});

app.get(
  "/api/v1/projects/:projectId/queues",
  auth,
  async (req: AuthedRequest, res: Response) => {
    try {
      const { page, pageSize, skip, take } = parsePagination(req.query);

      const where = { projectId: req.params.projectId };

      const [total, items] = await Promise.all([
        prisma.queue.count({ where }),
        prisma.queue.findMany({
          where,
          orderBy: { name: "asc" },
          skip,
          take
        })
      ]);

      return res.json({
        items,
        pagination: {
          page,
          pageSize,
          total,
          totalPages: Math.ceil(total / pageSize)
        }
      });
    } catch (err) {
      return handleRouteError(res, err, "Failed to load queues");
    }
  }
);

/**
 * NEW: Create queue under project
 */
app.post(
  "/api/v1/projects/:projectId/queues",
  auth,
  async (req: AuthedRequest, res: Response) => {
    try {
      const body = createQueueSchema.parse(req.body);

      const project = await prisma.project.findUnique({
        where: { id: req.params.projectId }
      });

      if (!project) {
        return res.status(404).json({ error: "Project not found" });
      }

      if (body.retryPolicyId) {
        const retryPolicy = await prisma.retryPolicy.findUnique({
          where: { id: body.retryPolicyId }
        });

        if (!retryPolicy) {
          return res.status(404).json({ error: "Retry policy not found" });
        }
      }

      const existingQueue = await prisma.queue.findUnique({
        where: {
          projectId_name: {
            projectId: project.id,
            name: body.name
          }
        }
      });

      if (existingQueue) {
        return res
          .status(409)
          .json({ error: "Queue name already exists in this project" });
      }

      const queue = await prisma.queue.create({
        data: {
          projectId: project.id,
          name: body.name,
          description: body.description ?? null,
          defaultPriority: body.defaultPriority ?? 5,
          concurrencyLimit: body.concurrencyLimit ?? 5,
          retryPolicyId: body.retryPolicyId ?? null,
          rateLimitCount: body.rateLimitCount ?? null,
          rateLimitWindowSec: body.rateLimitWindowSec ?? null
        }
      });

      return res.status(201).json(queue);
    } catch (err) {
      return handleRouteError(res, err, "Failed to create queue");
    }
  }
);

app.post(
  "/api/v1/queues/:queueId/pause",
  auth,
  async (req: AuthedRequest, res: Response) => {
    try {
      const queue = await prisma.queue.update({
        where: { id: req.params.queueId },
        data: { isPaused: true }
      });

      return res.json(queue);
    } catch (err) {
      return handleRouteError(res, err, "Failed to pause queue");
    }
  }
);

app.post(
  "/api/v1/queues/:queueId/resume",
  auth,
  async (req: AuthedRequest, res: Response) => {
    try {
      const queue = await prisma.queue.update({
        where: { id: req.params.queueId },
        data: { isPaused: false }
      });

      return res.json(queue);
    } catch (err) {
      return handleRouteError(res, err, "Failed to resume queue");
    }
  }
);

/**
 * NEW: Update queue configuration
 */
app.patch(
  "/api/v1/queues/:queueId",
  auth,
  async (req: AuthedRequest, res: Response) => {
    try {
      const body = updateQueueSchema.parse(req.body);

      const existingQueue = await prisma.queue.findUnique({
        where: { id: req.params.queueId }
      });

      if (!existingQueue) {
        return res.status(404).json({ error: "Queue not found" });
      }

      if (body.retryPolicyId) {
        const retryPolicy = await prisma.retryPolicy.findUnique({
          where: { id: body.retryPolicyId }
        });

        if (!retryPolicy) {
          return res.status(404).json({ error: "Retry policy not found" });
        }
      }

      if (body.name && body.name !== existingQueue.name) {
        const duplicate = await prisma.queue.findUnique({
          where: {
            projectId_name: {
              projectId: existingQueue.projectId,
              name: body.name
            }
          }
        });

        if (duplicate) {
          return res
            .status(409)
            .json({ error: "Queue name already exists in this project" });
        }
      }

      const updated = await prisma.queue.update({
        where: { id: req.params.queueId },
        data: {
          ...(body.name !== undefined ? { name: body.name } : {}),
          ...(body.description !== undefined
            ? { description: body.description }
            : {}),
          ...(body.defaultPriority !== undefined
            ? { defaultPriority: body.defaultPriority }
            : {}),
          ...(body.concurrencyLimit !== undefined
            ? { concurrencyLimit: body.concurrencyLimit }
            : {}),
          ...(body.retryPolicyId !== undefined
            ? { retryPolicyId: body.retryPolicyId }
            : {}),
          ...(body.rateLimitCount !== undefined
            ? { rateLimitCount: body.rateLimitCount }
            : {}),
          ...(body.rateLimitWindowSec !== undefined
            ? { rateLimitWindowSec: body.rateLimitWindowSec }
            : {}),
          ...(body.isPaused !== undefined ? { isPaused: body.isPaused } : {})
        }
      });

      return res.json(updated);
    } catch (err) {
      return handleRouteError(res, err, "Failed to update queue");
    }
  }
);

app.get(
  "/api/v1/queues/:queueId/jobs",
  auth,
  async (req: AuthedRequest, res: Response) => {
    try {
      const { page, pageSize, skip, take } = parsePagination(req.query);
      const status = req.query.status as string | undefined;

      const where = {
        queueId: req.params.queueId,
        ...(status ? { status: status as any } : {})
      };

      const [total, items] = await Promise.all([
        prisma.job.count({ where }),
        prisma.job.findMany({
          where,
          orderBy: { createdAt: "desc" },
          skip,
          take
        })
      ]);

      return res.json({
        items,
        pagination: {
          page,
          pageSize,
          total,
          totalPages: Math.ceil(total / pageSize)
        }
      });
    } catch (err) {
      return handleRouteError(res, err, "Failed to load jobs");
    }
  }
);

app.post(
  "/api/v1/queues/:queueId/jobs",
  auth,
  async (req: AuthedRequest, res: Response) => {
    try {
      const body = singleJobSchema.parse(req.body);

      const queue = await prisma.queue.findUnique({
        where: { id: req.params.queueId }
      });

      if (!queue) {
        return res.status(404).json({ error: "Queue not found" });
      }

      if (body.cronExpression) {
        const scheduledJob = await prisma.scheduledJob.create({
          data: {
            queueId: queue.id,
            name: body.name,
            jobType: body.jobType,
            payloadJson: body.payload,
            priority: body.priority ?? queue.defaultPriority,
            maxAttempts: body.maxAttempts ?? 3,
            cronExpression: body.cronExpression,
            timezone: body.timezone ?? null,
            nextRunAt: new Date(),
            isPaused: false
          }
        });

        return res.status(201).json({
          type: "scheduled-job",
          item: scheduledJob
        });
      }

      const schedule = computeJobSchedule({
        delaySeconds: body.delaySeconds,
        runAt: body.runAt
      });

      const job = await prisma.job.create({
        data: {
          queueId: queue.id,
          jobType: body.jobType,
          payloadJson: body.payload,
          priority: body.priority ?? queue.defaultPriority,
          maxAttempts: body.maxAttempts ?? 3,
          status: schedule.status,
          availableAt: schedule.availableAt
        }
      });

      return res.status(201).json({
        type: "job",
        item: job
      });
    } catch (err) {
      return handleRouteError(res, err, "Failed to create job");
    }
  }
);

app.post(
  "/api/v1/queues/:queueId/jobs/batch",
  auth,
  async (req: AuthedRequest, res: Response) => {
    try {
      const body = z
        .object({
          items: z.array(batchJobItemSchema).min(1).max(100)
        })
        .parse(req.body);

      const queue = await prisma.queue.findUnique({
        where: { id: req.params.queueId }
      });

      if (!queue) {
        return res.status(404).json({ error: "Queue not found" });
      }

      const batchId = crypto.randomUUID();

      const items = await prisma.$transaction(
        body.items.map((item) => {
          const schedule = computeJobSchedule({
            delaySeconds: item.delaySeconds,
            runAt: item.runAt
          });

          return prisma.job.create({
            data: {
              queueId: queue.id,
              jobType: item.jobType,
              payloadJson: item.payload,
              priority: item.priority ?? queue.defaultPriority,
              maxAttempts: item.maxAttempts ?? 3,
              status: schedule.status,
              availableAt: schedule.availableAt,
              batchId
            }
          });
        })
      );

      return res.status(201).json({
        batchId,
        queueId: queue.id,
        totalJobs: items.length,
        items
      });
    } catch (err) {
      return handleRouteError(res, err, "Failed to create batch jobs");
    }
  }
);

app.post(
  "/api/v1/jobs/:jobId/retry",
  auth,
  async (req: AuthedRequest, res: Response) => {
    try {
      const job = await prisma.job.findUnique({
        where: { id: req.params.jobId }
      });

      if (!job) {
        return res.status(404).json({ error: "Job not found" });
      }

      const updated = await prisma.job.update({
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

      await prisma.deadLetterJob.deleteMany({
        where: { jobId: job.id }
      });

      return res.json(updated);
    } catch (err) {
      return handleRouteError(res, err, "Failed to retry job");
    }
  }
);

app.get(
  "/api/v1/jobs/:jobId/executions",
  auth,
  async (req: AuthedRequest, res: Response) => {
    try {
      const { page, pageSize, skip, take } = parsePagination(req.query);

      const where = { jobId: req.params.jobId };

      const [total, items] = await Promise.all([
        prisma.jobExecution.count({ where }),
        prisma.jobExecution.findMany({
          where,
          orderBy: { attemptNumber: "asc" },
          skip,
          take
        })
      ]);

      return res.json({
        items,
        pagination: {
          page,
          pageSize,
          total,
          totalPages: Math.ceil(total / pageSize)
        }
      });
    } catch (err) {
      return handleRouteError(res, err, "Failed to load executions");
    }
  }
);

app.get(
  "/api/v1/jobs/:jobId/logs",
  auth,
  async (req: AuthedRequest, res: Response) => {
    try {
      const { page, pageSize, skip, take } = parsePagination(req.query);

      const where = { jobId: req.params.jobId };

      const [total, items] = await Promise.all([
        prisma.jobLog.count({ where }),
        prisma.jobLog.findMany({
          where,
          orderBy: { createdAt: "desc" },
          skip,
          take
        })
      ]);

      return res.json({
        items,
        pagination: {
          page,
          pageSize,
          total,
          totalPages: Math.ceil(total / pageSize)
        }
      });
    } catch (err) {
      return handleRouteError(res, err, "Failed to load job logs");
    }
  }
);

app.get(
  "/api/v1/queues/:queueId/stats",
  auth,
  async (req: AuthedRequest, res: Response) => {
    try {
      const queueId = req.params.queueId;

      const [queued, scheduled, claimed, running, completed, deadLetter] =
        await Promise.all([
          prisma.job.count({ where: { queueId, status: "QUEUED" } }),
          prisma.job.count({ where: { queueId, status: "SCHEDULED" } }),
          prisma.job.count({ where: { queueId, status: "CLAIMED" } }),
          prisma.job.count({ where: { queueId, status: "RUNNING" } }),
          prisma.job.count({ where: { queueId, status: "COMPLETED" } }),
          prisma.job.count({ where: { queueId, status: "DEAD_LETTER" } })
        ]);

      return res.json({
        queueId,
        queued,
        scheduled,
        claimed,
        running,
        completed,
        deadLetter
      });
    } catch (err) {
      return handleRouteError(res, err, "Failed to load queue stats");
    }
  }
);

app.get(
  "/api/v1/queues/:queueId/scheduled-jobs",
  auth,
  async (req: AuthedRequest, res: Response) => {
    try {
      const { page, pageSize, skip, take } = parsePagination(req.query);

      const where = { queueId: req.params.queueId };

      const [total, items] = await Promise.all([
        prisma.scheduledJob.count({ where }),
        prisma.scheduledJob.findMany({
          where,
          orderBy: { createdAt: "desc" },
          skip,
          take
        })
      ]);

      return res.json({
        items,
        pagination: {
          page,
          pageSize,
          total,
          totalPages: Math.ceil(total / pageSize)
        }
      });
    } catch (err) {
      return handleRouteError(res, err, "Failed to load scheduled jobs");
    }
  }
);

app.post(
  "/api/v1/scheduled-jobs/:scheduledJobId/pause",
  auth,
  async (req: AuthedRequest, res: Response) => {
    try {
      const scheduledJob = await prisma.scheduledJob.update({
        where: { id: req.params.scheduledJobId },
        data: { isPaused: true }
      });

      return res.json(scheduledJob);
    } catch (err) {
      return handleRouteError(res, err, "Failed to pause scheduled job");
    }
  }
);

app.post(
  "/api/v1/scheduled-jobs/:scheduledJobId/resume",
  auth,
  async (req: AuthedRequest, res: Response) => {
    try {
      const scheduledJob = await prisma.scheduledJob.update({
        where: { id: req.params.scheduledJobId },
        data: { isPaused: false }
      });

      return res.json(scheduledJob);
    } catch (err) {
      return handleRouteError(res, err, "Failed to resume scheduled job");
    }
  }
);

/**
 * NEW: Update recurring scheduled job definition
 */
app.patch(
  "/api/v1/scheduled-jobs/:scheduledJobId",
  auth,
  async (req: AuthedRequest, res: Response) => {
    try {
      const body = updateScheduledJobSchema.parse(req.body);

      const existing = await prisma.scheduledJob.findUnique({
        where: { id: req.params.scheduledJobId }
      });

      if (!existing) {
        return res.status(404).json({ error: "Scheduled job not found" });
      }

      const updated = await prisma.scheduledJob.update({
        where: { id: req.params.scheduledJobId },
        data: {
          ...(body.name !== undefined ? { name: body.name } : {}),
          ...(body.payload !== undefined ? { payloadJson: body.payload } : {}),
          ...(body.priority !== undefined ? { priority: body.priority } : {}),
          ...(body.maxAttempts !== undefined
            ? { maxAttempts: body.maxAttempts }
            : {}),
          ...(body.cronExpression !== undefined
            ? { cronExpression: body.cronExpression }
            : {}),
          ...(body.timezone !== undefined ? { timezone: body.timezone } : {}),
          ...(body.isPaused !== undefined ? { isPaused: body.isPaused } : {})
        }
      });

      return res.json(updated);
    } catch (err) {
      return handleRouteError(res, err, "Failed to update scheduled job");
    }
  }
);

/**
 * NEW: Delete recurring scheduled job definition
 */
app.delete(
  "/api/v1/scheduled-jobs/:scheduledJobId",
  auth,
  async (req: AuthedRequest, res: Response) => {
    try {
      const existing = await prisma.scheduledJob.findUnique({
        where: { id: req.params.scheduledJobId }
      });

      if (!existing) {
        return res.status(404).json({ error: "Scheduled job not found" });
      }

      await prisma.scheduledJob.delete({
        where: { id: req.params.scheduledJobId }
      });

      return res.json({
        ok: true,
        deletedId: req.params.scheduledJobId
      });
    } catch (err) {
      return handleRouteError(res, err, "Failed to delete scheduled job");
    }
  }
);

app.get("/api/v1/workers", auth, async (req: AuthedRequest, res: Response) => {
  try {
    const { page, pageSize, skip, take } = parsePagination(req.query);

    const [total, items] = await Promise.all([
      prisma.worker.count(),
      prisma.worker.findMany({
        orderBy: { workerName: "asc" },
        skip,
        take
      })
    ]);

    return res.json({
      items,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize)
      }
    });
  } catch (err) {
    return handleRouteError(res, err, "Failed to load workers");
  }
});

app.get(
  "/api/v1/dead-letter",
  auth,
  async (req: AuthedRequest, res: Response) => {
    try {
      const { page, pageSize, skip, take } = parsePagination(req.query);

      const [total, items] = await Promise.all([
        prisma.deadLetterJob.count(),
        prisma.deadLetterJob.findMany({
          include: { job: true },
          orderBy: { createdAt: "desc" },
          skip,
          take
        })
      ]);

      return res.json({
        items,
        pagination: {
          page,
          pageSize,
          total,
          totalPages: Math.ceil(total / pageSize)
        }
      });
    } catch (err) {
      return handleRouteError(res, err, "Failed to load dead letter queue");
    }
  }
);

app.post(
  "/api/v1/dead-letter/:id/requeue",
  auth,
  async (req: AuthedRequest, res: Response) => {
    try {
      const dlq = await prisma.deadLetterJob.findUnique({
        where: { id: req.params.id }
      });

      if (!dlq) {
        return res.status(404).json({ error: "DLQ entry not found" });
      }

      const job = await prisma.job.update({
        where: { id: dlq.jobId },
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

      return res.json(job);
    } catch (err) {
      return handleRouteError(res, err, "Failed to requeue dead letter job");
    }
  }
);

app.listen(env.API_PORT, () => {
  console.log(`[api] listening on ${env.API_PORT}`);
});