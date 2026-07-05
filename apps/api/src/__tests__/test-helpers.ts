import { prisma } from "@relay/db";

const TEST_QUEUE_IDS = [
  "00000000-0000-0000-0000-000000000101",
  "00000000-0000-0000-0000-000000000102"
];

export async function cleanupTestData() {
  await prisma.deadLetterJob.deleteMany({
    where: {
      job: {
        queueId: {
          in: TEST_QUEUE_IDS
        }
      }
    }
  });

  await prisma.jobExecution.deleteMany({
    where: {
      job: {
        queueId: {
          in: TEST_QUEUE_IDS
        }
      }
    }
  });

  await prisma.job.deleteMany({
    where: {
      queueId: {
        in: TEST_QUEUE_IDS
      }
    }
  });

  await prisma.scheduledJob.deleteMany({
    where: {
      queueId: {
        in: TEST_QUEUE_IDS
      }
    }
  });
}