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

app.get("/api/v1/projects", auth, async (_req: AuthedRequest, res: Response) => {
  try {
    const items = await prisma.project.findMany({
      orderBy: { name: "asc" }
    });

    return res.json({ items });
  } catch (err) {
    return handleRouteError(res, err, "Failed to load projects");
  }
});

app.get(
  "/api/v1/projects/:projectId/queues",
  auth,
  async (req: AuthedRequest, res: Response) => {
    try {
      const items = await prisma.queue.findMany({
        where: { projectId: req.params.projectId },
        orderBy: { name: "asc" }
      });

      return res.json({ items });
    } catch (err) {
      return handleRouteError(res, err, "Failed to load queues");
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

app.get(
  "/api/v1/queues/:queueId/jobs",
  auth,
  async (req: AuthedRequest, res: Response) => {
    try {
      const status = req.query.status as string | undefined;

      const items = await prisma.job.findMany({
        where: {
          queueId: req.params.queueId,
          ...(status ? { status: status as any } : {})
        },
        orderBy: { createdAt: "desc" }
      });

      return res.json({ items });
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
      const body = z
        .object({
          jobType: z.enum(["send-email", "generate-report", "fail-demo"]),
          payload: z.record(z.any()),
          priority: z.number().int().min(1).max(100).optional()
        })
        .parse(req.body);

      const queue = await prisma.queue.findUnique({
        where: { id: req.params.queueId }
      });

      if (!queue) {
        return res.status(404).json({ error: "Queue not found" });
      }

      const job = await prisma.job.create({
        data: {
          queueId: queue.id,
          jobType: body.jobType,
          payloadJson: body.payload,
          priority: body.priority ?? queue.defaultPriority
        }
      });

      return res.status(201).json(job);
    } catch (err) {
      return handleRouteError(res, err, "Failed to create job");
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
      const items = await prisma.jobExecution.findMany({
        where: { jobId: req.params.jobId },
        orderBy: { attemptNumber: "asc" }
      });

      return res.json({ items });
    } catch (err) {
      return handleRouteError(res, err, "Failed to load executions");
    }
  }
);

app.get(
  "/api/v1/queues/:queueId/stats",
  auth,
  async (req: AuthedRequest, res: Response) => {
    try {
      const queueId = req.params.queueId;

      const [queued, claimed, running, completed, deadLetter] = await Promise.all([
        prisma.job.count({ where: { queueId, status: "QUEUED" } }),
        prisma.job.count({ where: { queueId, status: "CLAIMED" } }),
        prisma.job.count({ where: { queueId, status: "RUNNING" } }),
        prisma.job.count({ where: { queueId, status: "COMPLETED" } }),
        prisma.job.count({ where: { queueId, status: "DEAD_LETTER" } })
      ]);

      return res.json({
        queueId,
        queued,
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

app.get("/api/v1/workers", auth, async (_req: AuthedRequest, res: Response) => {
  try {
    const items = await prisma.worker.findMany({
      orderBy: { workerName: "asc" }
    });

    return res.json({ items });
  } catch (err) {
    return handleRouteError(res, err, "Failed to load workers");
  }
});

app.get("/api/v1/dead-letter", auth, async (_req: AuthedRequest, res: Response) => {
  try {
    const items = await prisma.deadLetterJob.findMany({
      include: { job: true },
      orderBy: { createdAt: "desc" }
    });

    return res.json({ items });
  } catch (err) {
    return handleRouteError(res, err, "Failed to load dead letter queue");
  }
});

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