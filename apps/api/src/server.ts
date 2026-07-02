import "dotenv/config";
import express from "express";
import cors from "cors";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { env } from "@relay/config";
import { prisma } from "@relay/db/src/client";

const app = express();
app.use(cors());
app.use(express.json());

function auth(req: any, res: any, next: any) {
  const h = req.headers.authorization;
  if (!h?.startsWith("Bearer ")) return res.status(401).json({ error: "Missing token" });
  try {
    req.user = jwt.verify(h.replace("Bearer ", ""), env.JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: "Invalid token" });
  }
}

app.get("/health", (_req, res) => res.json({ ok: true }));

app.post("/api/v1/auth/login", async (req, res) => {
  const body = z.object({
    email: z.string().email(),
    password: z.string().min(6)
  }).parse(req.body);

  const user = await prisma.user.findUnique({ where: { email: body.email } });
  if (!user) return res.status(401).json({ error: "Invalid credentials" });

  const ok = await bcrypt.compare(body.password, user.passwordHash);
  if (!ok) return res.status(401).json({ error: "Invalid credentials" });

  const token = jwt.sign(
    { userId: user.id, email: user.email },
    env.JWT_SECRET,
    { expiresIn: env.JWT_EXPIRES_IN as any }
  );

  res.json({ token, user: { id: user.id, email: user.email, name: user.name } });
});

app.get("/api/v1/projects", auth, async (_req, res) => {
  const items = await prisma.project.findMany({ orderBy: { name: "asc" } });
  res.json({ items });
});

app.get("/api/v1/projects/:projectId/queues", auth, async (req, res) => {
  const items = await prisma.queue.findMany({
    where: { projectId: req.params.projectId },
    orderBy: { name: "asc" }
  });
  res.json({ items });
});

app.post("/api/v1/queues/:queueId/pause", auth, async (req, res) => {
  const queue = await prisma.queue.update({
    where: { id: req.params.queueId },
    data: { isPaused: true }
  });
  res.json(queue);
});

app.post("/api/v1/queues/:queueId/resume", auth, async (req, res) => {
  const queue = await prisma.queue.update({
    where: { id: req.params.queueId },
    data: { isPaused: false }
  });
  res.json(queue);
});

app.get("/api/v1/queues/:queueId/jobs", auth, async (req, res) => {
  const status = req.query.status as string | undefined;
  const items = await prisma.job.findMany({
    where: {
      queueId: req.params.queueId,
      ...(status ? { status: status as any } : {})
    },
    orderBy: { createdAt: "desc" }
  });
  res.json({ items });
});

app.post("/api/v1/queues/:queueId/jobs", auth, async (req, res) => {
  const body = z.object({
    jobType: z.enum(["send-email", "generate-report", "fail-demo"]),
    payload: z.record(z.any()),
    priority: z.number().int().min(1).max(100).optional()
  }).parse(req.body);

  const queue = await prisma.queue.findUnique({ where: { id: req.params.queueId } });
  if (!queue) return res.status(404).json({ error: "Queue not found" });

  const job = await prisma.job.create({
    data: {
      queueId: queue.id,
      jobType: body.jobType,
      payloadJson: body.payload,
      priority: body.priority ?? queue.defaultPriority
    }
  });

  res.status(201).json(job);
});

app.post("/api/v1/jobs/:jobId/retry", auth, async (req, res) => {
  const job = await prisma.job.findUnique({ where: { id: req.params.jobId } });
  if (!job) return res.status(404).json({ error: "Job not found" });

  const updated = await prisma.job.update({
    where: { id: job.id },
    data: {
      status: "QUEUED",
      availableAt: new Date(),
      lastError: null,
      claimedByWorkerId: null,
      claimedAt: null,
      leaseExpiresAt: null
    }
  });

  await prisma.deadLetterJob.deleteMany({ where: { jobId: job.id } });
  res.json(updated);
});

app.get("/api/v1/jobs/:jobId/executions", auth, async (req, res) => {
  const items = await prisma.jobExecution.findMany({
    where: { jobId: req.params.jobId },
    orderBy: { attemptNumber: "asc" }
  });
  res.json({ items });
});

app.get("/api/v1/queues/:queueId/stats", auth, async (req, res) => {
  const queueId = req.params.queueId;
  const [queued, running, completed, deadLetter] = await Promise.all([
    prisma.job.count({ where: { queueId, status: "QUEUED" } }),
    prisma.job.count({ where: { queueId, status: "RUNNING" } }),
    prisma.job.count({ where: { queueId, status: "COMPLETED" } }),
    prisma.job.count({ where: { queueId, status: "DEAD_LETTER" } })
  ]);
  res.json({ queueId, queued, running, completed, deadLetter });
});

app.get("/api/v1/workers", auth, async (_req, res) => {
  const items = await prisma.worker.findMany({
    orderBy: { workerName: "asc" }
  });
  res.json({ items });
});

app.get("/api/v1/dead-letter", auth, async (_req, res) => {
  const items = await prisma.deadLetterJob.findMany({
    include: { job: true }
  });
  res.json({ items });
});

app.post("/api/v1/dead-letter/:id/requeue", auth, async (req, res) => {
  const dlq = await prisma.deadLetterJob.findUnique({
    where: { id: req.params.id }
  });
  if (!dlq) return res.status(404).json({ error: "DLQ entry not found" });

  const job = await prisma.job.update({
    where: { id: dlq.jobId },
    data: {
      status: "QUEUED",
      availableAt: new Date(),
      lastError: null,
      claimedByWorkerId: null,
      claimedAt: null,
      leaseExpiresAt: null
    }
  });

  await prisma.deadLetterJob.delete({ where: { id: dlq.id } });
  res.json(job);
});

app.listen(env.API_PORT, () => console.log(`API on ${env.API_PORT}`));
