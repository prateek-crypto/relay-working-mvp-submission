# Relay MVP API Documentation

This document describes the REST API exposed by the Relay distributed job scheduling MVP.

## Base URL

Local development:

```http
http://localhost:4000
All API routes are prefixed with:
/api/v1
1. Health Check
GET /health

Used to verify that the API service is running.

Response
{
  "ok": true
}
2. Authentication
POST /api/v1/auth/login

Authenticates a user and returns a JWT token.

Request Body
{
  "email": "demo@relay.dev",
  "password": "password123"
}
Success Response
{
  "token": "jwt-token-here",
  "user": {
    "id": "user-id",
    "email": "demo@relay.dev",
    "name": "Demo User"
  }
}
Failure Response
{
  "error": "Invalid credentials"
}
3. Projects
GET /api/v1/projects

Returns all projects visible to the authenticated user.

Headers
Authorization: Bearer <token>
Success Response
{
  "items": [
    {
      "id": "f8f93cbe-63f9-47a6-93a0-33a58d69dfb0",
      "name": "Relay Demo Project",
      "slug": "relay-demo",
      "createdAt": "2026-07-03T09:00:00.000Z"
    }
  ]
}
4. Queues
GET /api/v1/projects/:projectId/queues

Returns all queues belonging to a project.

Example
GET /api/v1/projects/f8f93cbe-63f9-47a6-93a0-33a58d69dfb0/queues
Success Response
{
  "items": [
    {
      "id": "00000000-0000-0000-0000-000000000101",
      "projectId": "f8f93cbe-63f9-47a6-93a0-33a58d69dfb0",
      "name": "email-notifications",
      "description": null,
      "isPaused": false,
      "defaultPriority": 5,
      "concurrencyLimit": 5,
      "retryPolicyId": "69943616-5575-455f-8579-6a7696a61362"
    }
  ]
}
POST /api/v1/queues/:queueId/pause

Pauses a queue. Workers will stop claiming new jobs from that queue.

Success Response
{
  "id": "00000000-0000-0000-0000-000000000101",
  "name": "email-notifications",
  "isPaused": true
}
POST /api/v1/queues/:queueId/resume

Resumes a paused queue.

Success Response
{
  "id": "00000000-0000-0000-0000-000000000101",
  "name": "email-notifications",
  "isPaused": false
}
GET /api/v1/queues/:queueId/stats

Returns queue-level job statistics.

Success Response
{
  "queueId": "00000000-0000-0000-0000-000000000101",
  "queued": 0,
  "scheduled": 2,
  "claimed": 0,
  "running": 0,
  "completed": 18,
  "deadLetter": 4
}
5. Jobs
GET /api/v1/queues/:queueId/jobs

Returns jobs belonging to a queue.

Optional Query Parameters
status → filter jobs by status (QUEUED, SCHEDULED, RUNNING, COMPLETED, DEAD_LETTER, etc.)
Example
GET /api/v1/queues/00000000-0000-0000-0000-000000000101/jobs?status=COMPLETED
Success Response
{
  "items": [
    {
      "id": "520ef797-6e0e-4a29-a387-71f617ff785b",
      "queueId": "00000000-0000-0000-0000-000000000101",
      "jobType": "send-email",
      "payloadJson": {
        "to": "demo@relay.dev",
        "subject": "Batch immediate 1"
      },
      "status": "QUEUED",
      "priority": 5,
      "attemptCount": 0,
      "maxAttempts": 3,
      "availableAt": "2026-07-05T08:36:00.467Z",
      "batchId": "35aceee4-1e7e-4329-926f-a824d03508ba"
    }
  ]
}
POST /api/v1/queues/:queueId/jobs

Creates a single job in a queue.

This endpoint supports:

immediate jobs
delayed jobs
one-time scheduled jobs
recurring scheduled job definitions

The request body determines which type gets created.

A) Immediate Job
Request Body
{
  "jobType": "send-email",
  "payload": {
    "to": "demo@relay.dev",
    "subject": "Immediate email"
  }
}
Success Response
{
  "type": "job",
  "item": {
    "id": "job-id",
    "queueId": "00000000-0000-0000-0000-000000000101",
    "jobType": "send-email",
    "status": "QUEUED"
  }
}
B) Delayed Job
Request Body
{
  "jobType": "send-email",
  "payload": {
    "to": "demo@relay.dev",
    "subject": "Delayed email"
  },
  "delaySeconds": 120
}

This creates a job with:

status = SCHEDULED
availableAt = current time + delaySeconds
C) One-Time Scheduled Job
Request Body
{
  "jobType": "send-email",
  "payload": {
    "to": "demo@relay.dev",
    "subject": "Run later tonight"
  },
  "runAt": "2026-07-05T19:30:00.000Z"
}

This creates a job with:

status = SCHEDULED
availableAt = runAt
D) Recurring Scheduled Job Definition
Request Body
{
  "name": "5-min sales report",
  "jobType": "generate-report",
  "payload": {
    "report": "daily-sales"
  },
  "cronExpression": "*/5 * * * *"
}
Success Response
{
  "type": "scheduled-job",
  "item": {
    "id": "758c9deb-7390-4310-a0ad-40be0a6683f2",
    "queueId": "00000000-0000-0000-0000-000000000102",
    "name": "5-min sales report",
    "jobType": "generate-report",
    "priority": 5,
    "maxAttempts": 3,
    "cronExpression": "*/5 * * * *",
    "nextRunAt": "2026-07-05T08:16:52.547Z",
    "isPaused": false
  }
}
6. Batch Jobs
POST /api/v1/queues/:queueId/jobs/batch

Creates multiple jobs in a single request.

Each item can be:

immediate
delayed
one-time scheduled

All jobs created in the same request share the same batchId.

Request Body
{
  "items": [
    {
      "jobType": "send-email",
      "payload": {
        "to": "demo@relay.dev",
        "subject": "Batch immediate 1"
      }
    },
    {
      "jobType": "send-email",
      "payload": {
        "to": "demo@relay.dev",
        "subject": "Batch delayed 2"
      },
      "delaySeconds": 90
    },
    {
      "jobType": "send-email",
      "payload": {
        "to": "demo@relay.dev",
        "subject": "Batch scheduled 3"
      },
      "runAt": "2026-07-05T19:30:00.000Z"
    }
  ]
}
Success Response
{
  "batchId": "35aceee4-1e7e-4329-926f-a824d03508ba",
  "queueId": "00000000-0000-0000-0000-000000000101",
  "totalJobs": 3,
  "items": [
    {
      "id": "520ef797-6e0e-4a29-a387-71f617ff785b",
      "status": "QUEUED",
      "batchId": "35aceee4-1e7e-4329-926f-a824d03508ba"
    },
    {
      "id": "a6b6da4f-817c-4d16-80e9-59a793cd0e81",
      "status": "SCHEDULED",
      "batchId": "35aceee4-1e7e-4329-926f-a824d03508ba"
    },
    {
      "id": "15beeb4d-08b3-401a-98d1-319a45b76f19",
      "status": "SCHEDULED",
      "batchId": "35aceee4-1e7e-4329-926f-a824d03508ba"
    }
  ]
}
7. Job Retry
POST /api/v1/jobs/:jobId/retry

Retries a failed or dead-lettered job by resetting it back to QUEUED.

Success Response
{
  "id": "job-id",
  "status": "QUEUED",
  "attemptCount": 0,
  "lastError": null
}
8. Job Execution History
GET /api/v1/jobs/:jobId/executions

Returns execution attempts for a job.

Success Response
{
  "items": [
    {
      "id": "execution-id",
      "jobId": "job-id",
      "workerId": "worker-id",
      "attemptNumber": 1,
      "status": "SUCCEEDED",
      "startedAt": "2026-07-05T08:00:00.000Z",
      "finishedAt": "2026-07-05T08:00:01.000Z"
    }
  ]
}
9. Scheduled Jobs
GET /api/v1/queues/:queueId/scheduled-jobs

Returns recurring scheduled job definitions for a queue.

Success Response
{
  "items": [
    {
      "id": "758c9deb-7390-4310-a0ad-40be0a6683f2",
      "queueId": "00000000-0000-0000-0000-000000000102",
      "name": "5-min sales report",
      "jobType": "generate-report",
      "cronExpression": "*/5 * * * *",
      "nextRunAt": "2026-07-05T08:16:52.547Z",
      "isPaused": false
    }
  ]
}
POST /api/v1/scheduled-jobs/:scheduledJobId/pause

Pauses a recurring scheduled job definition.

Success Response
{
  "id": "758c9deb-7390-4310-a0ad-40be0a6683f2",
  "isPaused": true
}
POST /api/v1/scheduled-jobs/:scheduledJobId/resume

Resumes a recurring scheduled job definition.

Success Response
{
  "id": "758c9deb-7390-4310-a0ad-40be0a6683f2",
  "isPaused": false
}
10. Workers
GET /api/v1/workers

Returns all registered workers and their latest heartbeat information.

Success Response
{
  "items": [
    {
      "id": "worker-id",
      "workerName": "worker-1",
      "status": "ACTIVE",
      "startedAt": "2026-07-05T08:00:00.000Z",
      "lastHeartbeatAt": "2026-07-05T08:10:00.000Z"
    }
  ]
}
11. Dead Letter Queue
GET /api/v1/dead-letter

Returns all dead-letter jobs.

Success Response
{
  "items": [
    {
      "id": "dlq-id",
      "jobId": "job-id",
      "failureReason": "Intentional demo failure",
      "finalAttempt": 3,
      "createdAt": "2026-07-05T08:10:00.000Z",
      "job": {
        "id": "job-id",
        "jobType": "fail-demo",
        "status": "DEAD_LETTER"
      }
    }
  ]
}
POST /api/v1/dead-letter/:id/requeue

Moves a dead-letter job back into the queue.

Success Response
{
  "id": "job-id",
  "status": "QUEUED",
  "attemptCount": 0,
  "lastError": null
}
Common Error Responses
400 Validation Error
{
  "error": "Validation failed",
  "details": {
    "fieldErrors": {
      "jobType": ["Required"]
    }
  }
}
401 Unauthorized
{
  "error": "Missing token"
}

or

{
  "error": "Invalid token"
}
404 Not Found
{
  "error": "Queue not found"
}
500 Internal Server Error
{
  "error": "Failed to create job"
}
