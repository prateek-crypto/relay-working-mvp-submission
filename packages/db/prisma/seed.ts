import bcrypt from "bcryptjs";
import { prisma } from "../src/client";

async function main() {
  const passwordHash = await bcrypt.hash("password123", 10);

  const user = await prisma.user.upsert({
    where: { email: "demo@relay.dev" },
    update: { name: "Demo User", passwordHash },
    create: { email: "demo@relay.dev", passwordHash, name: "Demo User" }
  });

  let project = await prisma.project.findUnique({ where: { slug: "relay-demo" } });
  if (!project) {
    project = await prisma.project.create({
      data: { name: "Relay Demo Project", slug: "relay-demo" }
    });
  }

  let retryPolicy = await prisma.retryPolicy.findFirst({
    where: { name: "standard-exponential-retry" }
  });
  if (!retryPolicy) {
    retryPolicy = await prisma.retryPolicy.create({
      data: {
        name: "standard-exponential-retry",
        strategy: "EXPONENTIAL",
        baseDelayMs: 5000,
        maxAttempts: 3
      }
    });
  }

  const emailQueue = await prisma.queue.upsert({
    where: { id: "00000000-0000-0000-0000-000000000101" },
    update: {
      name: "email-notifications",
      projectId: project.id,
      retryPolicyId: retryPolicy.id,
      concurrencyLimit: 5
    },
    create: {
      id: "00000000-0000-0000-0000-000000000101",
      projectId: project.id,
      name: "email-notifications",
      retryPolicyId: retryPolicy.id,
      concurrencyLimit: 5
    }
  });

  const reportQueue = await prisma.queue.upsert({
    where: { id: "00000000-0000-0000-0000-000000000102" },
    update: {
      name: "report-generation",
      projectId: project.id,
      retryPolicyId: retryPolicy.id,
      concurrencyLimit: 3
    },
    create: {
      id: "00000000-0000-0000-0000-000000000102",
      projectId: project.id,
      name: "report-generation",
      retryPolicyId: retryPolicy.id,
      concurrencyLimit: 3
    }
  });

  const existingJobs = await prisma.job.count({
    where: { queueId: { in: [emailQueue.id, reportQueue.id] } }
  });

  if (existingJobs === 0) {
    await prisma.job.createMany({
      data: [
        { queueId: emailQueue.id, jobType: "send-email", payloadJson: { to: "alice@example.com", template: "welcome" }, priority: 10, status: "QUEUED" },
        { queueId: emailQueue.id, jobType: "send-email", payloadJson: { to: "bob@example.com", template: "invoice" }, priority: 8, status: "QUEUED" },
        { queueId: emailQueue.id, jobType: "fail-demo", payloadJson: { reason: "simulate failure" }, priority: 9, status: "QUEUED" },
        { queueId: reportQueue.id, jobType: "generate-report", payloadJson: { report: "daily-sales" }, priority: 9, status: "QUEUED" },
        { queueId: reportQueue.id, jobType: "generate-report", payloadJson: { report: "monthly-summary" }, priority: 7, status: "QUEUED" },
        { queueId: reportQueue.id, jobType: "generate-report", payloadJson: { report: "customer-health" }, priority: 6, status: "QUEUED" },
        { queueId: emailQueue.id, jobType: "send-email", payloadJson: { to: "carol@example.com", template: "newsletter" }, priority: 5, status: "COMPLETED", completedAt: new Date() },
        { queueId: reportQueue.id, jobType: "generate-report", payloadJson: { report: "ops-overview" }, priority: 5, status: "COMPLETED", completedAt: new Date() }
      ]
    });
  }

  console.log("Seed complete");
  console.log("Demo user: demo@relay.dev / password123");
  console.log("Project slug: relay-demo");
  console.log("Queues: email-notifications, report-generation");
}
main().finally(async () => prisma.$disconnect());
