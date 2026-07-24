# Relay — Distributed Job Scheduling Platform

Relay is a **production-inspired distributed job scheduling platform** for reliably executing asynchronous background jobs across multiple workers.

It provides:

- **JWT-based authentication**
- **Projects and queues**
- **Immediate, delayed, recurring cron, and batch jobs**
- **Atomic worker-side job claiming with PostgreSQL row-level locking**
- **Retries with fixed / linear / exponential backoff**
- **Dead-letter queue handling**
- **Execution logs and retry history**
- **Worker heartbeats and operational visibility**
- **A React dashboard to manage queues, jobs, scheduled jobs, workers, and DLQ recovery**

This project was built as a **backend + full-stack systems design assignment** focused on **reliability, concurrency, observability, and maintainability** rather than feature count.

---

# Table of Contents

- [1. Objective](#1-objective)
- [2. Key Features](#2-key-features)
- [3. Tech Stack](#3-tech-stack)
- [4. System Architecture](#4-system-architecture)
- [5. Database Design](#5-database-design)
- [6. Backend Capabilities](#6-backend-capabilities)
- [7. Frontend Dashboard](#7-frontend-dashboard)
- [8. Project Structure](#8-project-structure)
- [9. Setup Instructions](#9-setup-instructions)
- [10. Environment Variables](#10-environment-variables)
- [11. Running the System](#11-running-the-system)
- [12. GitHub Actions & Deployment](#12-github-actions--deployment)
- [13. API Overview](#13-api-overview)
- [13. Worker Lifecycle](#13-worker-lifecycle)
- [14. Reliability Features](#14-reliability-features)
- [15. Testing](#15-testing)
- [16. Design Decisions & Trade-offs](#16-design-decisions--trade-offs)
- [17. Implemented vs Assignment Bonus Scope](#17-implemented-vs-assignment-bonus-scope)
- [18. Screenshots](#18-screenshots)
- [19. Future Improvements](#19-future-improvements)

---

# 1. Objective

Design and build a production-inspired distributed job scheduling platform capable of reliably executing asynchronous background jobs across multiple workers.

Relay focuses on the following engineering concerns:

- **job orchestration**
- **queue ownership and configuration**
- **safe concurrent execution**
- **retries and dead-letter handling**
- **worker heartbeats and observability**
- **REST APIs + dashboard operations**
- **database design for scheduler workloads**

---

# 2. Key Features

## Authentication & Project Ownership
- Demo login via JWT
- Multi-project model
- Each project owns multiple queues

## Queue Management
- Create queues under projects
- Update queue configuration
- Pause / resume queues
- Queue-level default priority
- Queue-level concurrency limit
- Optional queue-level rate limiting
- Retry-aware execution behavior backed by queue / policy settings
- Queue statistics endpoint

## Job Types
Relay supports:

- **Immediate jobs**
- **Delayed jobs**
- **Recurring cron jobs**
- **Batch jobs**

## Worker System
- Worker polling loop
- Heartbeat updates
- Graceful shutdown support
- Concurrent execution up to queue concurrency limits
- Lease-based claiming metadata
- Worker assignment tracking

## Job Lifecycle
Jobs move through states such as:

- `QUEUED`
- `SCHEDULED`
- `CLAIMED`
- `RUNNING`
- `COMPLETED`
- `FAILED`
- `DEAD_LETTER`

## Reliability Features
- Atomic claiming with **PostgreSQL `FOR UPDATE SKIP LOCKED`**
- Retry support
- Retry strategies:
  - fixed delay
  - linear backoff
  - exponential backoff
- Dead Letter Queue for permanent failures
- Job execution logs
- Retry history
- Worker claim / start / complete / failure log events
- Queue-level rate limiting
- Job dependency support

## Observability
- Queue statistics
- Worker status
- Job logs
- Dead-letter queue view
- Scheduled job visibility
- Execution metrics and timestamps

## Frontend Dashboard
- Project explorer
- Queue creation and queue configuration
- Job creation
- Recurring scheduled job creation
- Job table
- Worker table
- Dead-letter queue table
- Queue pause/resume actions
- Scheduled jobs panel

---

# 3. Tech Stack

## Backend
- **Node.js**
- **TypeScript**
- **Express**
- **Prisma ORM**
- **PostgreSQL**
- **JWT authentication**

## Worker
- **Node.js + TypeScript**
- Polling worker service
- PostgreSQL-backed atomic claim loop

## Frontend
- **React**
- **Vite**
- **TypeScript**

## Infra / Tooling
- **Docker / Docker Compose**
- **Vitest** for automated tests
- **Prisma Migrate**
- **npm workspaces**

---

# 4. System Architecture

## High-level Architecture

```mermaid
flowchart LR
    U[User / Operator] --> W[React Dashboard]
    P[Postman / API Client] --> A[Express API Server]

    W --> A
    A --> DB[(PostgreSQL)]
    A --> AUTH[JWT Auth Layer]
    A --> SVC[Project / Queue / Job Services]

    WRK1[Worker-1] --> DB
    WRK2[Worker-2] --> DB
    WRK3[Worker-N] --> DB

    DB --> JOBS[Jobs]
    DB --> QUEUES[Queues]
    DB --> EXECS[Job Executions]
    DB --> LOGS[Job Logs]
    DB --> DLQ[Dead Letter Queue]
    DB --> SCHEDULES[Scheduled Jobs]
    DB --> WORKERS[Workers]

    SVC --> JOBS
    SVC --> QUEUES
    SVC --> SCHEDULES
    SVC --> DLQ
```

---

## Execution / Claim Flow

```mermaid
sequenceDiagram
    participant API as API Server
    participant DB as PostgreSQL
    participant W as Worker

    API->>DB: Insert job / recurring schedule
    W->>DB: Poll queues and scan due schedules
    W->>DB: Materialize due recurring jobs
    W->>DB: BEGIN transaction
    W->>DB: SELECT eligible jobs FOR UPDATE SKIP LOCKED
    W->>DB: Mark jobs CLAIMED + assign worker + lease metadata
    W->>DB: COMMIT
    W->>DB: Insert CLAIMED / STARTED job logs
    W->>W: Execute handler concurrently

    alt success
        W->>DB: Mark COMPLETED
        W->>DB: Insert execution + COMPLETED log
    else failure but attempts remain
        W->>DB: Compute retry delay
        W->>DB: Requeue / reschedule job
        W->>DB: Insert retry execution + RETRY_SCHEDULED log
    else permanent failure
        W->>DB: Mark DEAD_LETTER
        W->>DB: Insert DLQ record + FAILED / DEAD_LETTER log
    end
```

---

# 5. Database Design

Relay uses a **relational PostgreSQL schema** optimized for queue-driven background execution.

## Core Entities
- `User`
- `Project`
- `RetryPolicy`
- `Queue`
- `Worker`
- `Job`
- `JobExecution`
- `JobLog`
- `DeadLetterJob`
- `JobDependency`
- `ScheduledJob`

---

## ER Diagram

```mermaid
erDiagram
    PROJECT ||--o{ QUEUE : contains
    RETRY_POLICY ||--o{ QUEUE : configures
    QUEUE ||--o{ JOB : owns
    QUEUE ||--o{ SCHEDULED_JOB : owns
    WORKER ||--o{ JOB_EXECUTION : performs
    JOB ||--o{ JOB_EXECUTION : has
    JOB ||--o{ JOB_LOG : emits
    JOB ||--o| DEAD_LETTER_JOB : may_move_to
    SCHEDULED_JOB ||--o{ JOB : materializes_into
    JOB ||--o{ JOB_DEPENDENCY : parent
    JOB ||--o{ JOB_DEPENDENCY : child

    USER {
      string id PK
      string email
      string passwordHash
      string name
      enum role
      datetime createdAt
    }

    PROJECT {
      string id PK
      string name
      string slug
      datetime createdAt
    }

    RETRY_POLICY {
      string id PK
      string name
      enum strategy
      int baseDelayMs
      int maxAttempts
      int maxDelayMs
      datetime createdAt
    }

    QUEUE {
      string id PK
      string projectId FK
      string retryPolicyId FK
      string name
      string description
      boolean isPaused
      int defaultPriority
      int concurrencyLimit
      int rateLimitCount
      int rateLimitWindowSec
      datetime createdAt
      datetime updatedAt
    }

    WORKER {
      string id PK
      string workerName
      enum status
      datetime startedAt
      datetime lastHeartbeatAt
    }

    JOB {
      string id PK
      string queueId FK
      string jobType
      json payloadJson
      enum status
      int priority
      int attemptCount
      int maxAttempts
      datetime availableAt
      string batchId
      string sourceScheduledJobId FK
      string claimedByWorkerId
      datetime leaseExpiresAt
      datetime claimedAt
      datetime completedAt
      string lastError
      datetime createdAt
      datetime updatedAt
    }

    JOB_EXECUTION {
      string id PK
      string jobId FK
      string workerId FK
      int attemptNumber
      enum status
      string errorMessage
      datetime startedAt
      datetime finishedAt
      int durationMs
    }

    JOB_LOG {
      string id PK
      string jobId FK
      enum level
      enum event
      string message
      json metadataJson
      datetime createdAt
    }

    DEAD_LETTER_JOB {
      string id PK
      string jobId FK
      string failureReason
      int finalAttempt
      string failureSummary
      datetime createdAt
    }

    JOB_DEPENDENCY {
      string id PK
      string parentJobId FK
      string childJobId FK
      datetime createdAt
    }

    SCHEDULED_JOB {
      string id PK
      string queueId FK
      string name
      string jobType
      json payloadJson
      int priority
      int maxAttempts
      string cronExpression
      string timezone
      datetime nextRunAt
      datetime lastEnqueuedAt
      boolean isPaused
      datetime createdAt
      datetime updatedAt
    }
```

---

## Schema Notes

### Primary Keys
All major entities use UUID/string primary keys to make distributed creation safe and to expose stable identifiers through the API.

### Foreign Keys
The current schema uses the following important foreign key relationships:

- `Queue.projectId -> Project.id`
- `Queue.retryPolicyId -> RetryPolicy.id`
- `Job.queueId -> Queue.id`
- `Job.sourceScheduledJobId -> ScheduledJob.id`
- `JobExecution.jobId -> Job.id`
- `JobExecution.workerId -> Worker.id`
- `JobLog.jobId -> Job.id`
- `DeadLetterJob.jobId -> Job.id`
- `ScheduledJob.queueId -> Queue.id`
- `JobDependency.parentJobId -> Job.id`
- `JobDependency.childJobId -> Job.id`

### Important Indexes
The schema is optimized around worker polling, job claiming, queue inspection, and recurring scheduling. Important indexes include:

- `Job(queueId, status, availableAt, createdAt)`
- `Job(status, availableAt)`
- `Job(batchId)`
- `Job(claimedByWorkerId)`
- `Job(sourceScheduledJobId)`
- `Queue(projectId)`
- `Worker(status)`
- `JobExecution(jobId, attemptNumber)`
- `JobExecution(workerId)`
- `JobLog(jobId, createdAt)`
- `ScheduledJob(queueId)`
- `ScheduledJob(nextRunAt)`
- `ScheduledJob(isPaused, nextRunAt)`
- `JobDependency(childJobId)`
- `JobDependency(parentJobId)`

### Cascading Behavior
The schema uses cascading / cleanup behavior to keep related scheduler data consistent:

- deleting a `Project` cascades to its `Queue` rows
- deleting a `Queue` cascades to its `Job` rows and `ScheduledJob` rows
- deleting a `Job` cascades to its `JobExecution`, `JobLog`, `DeadLetterJob`, and dependency rows
- deleting a `ScheduledJob` does not delete already materialized jobs, but future recurring materialization stops

---

# 6. Backend Capabilities

## Authentication
- `POST /api/v1/auth/login`
- Demo login returns JWT token
- Protected routes use `Authorization: Bearer <token>`

## Projects
- Create project
- List projects

## Queues
- Create queue under project
- List queues under project
- Update queue configuration
- Pause queue
- Resume queue
- Queue stats

## Jobs
- Create immediate jobs
- Create delayed jobs
- Create batch jobs
- List jobs by queue

## Scheduled / Recurring Jobs
- Create recurring scheduled jobs using cron expression
- List scheduled jobs for queue
- Update scheduled job
- Delete scheduled job
- Worker materializes recurring schedules into runnable jobs

## Workers
- Worker registration / identity
- Worker heartbeat updates
- Worker listing endpoint
- Worker assignment tracking per job execution

## Logs & Executions
- Job execution records
- Job log events
- Retry scheduling logs
- recurring materialization logs
- dead-letter movement logs

---

# 7. Frontend Dashboard

The React dashboard provides a single operational surface for managing Relay.

## Current UI sections
- **Project Explorer**
  - select project
  - create project
  - select queue

- **Create Queue**
  - create queue under selected project

- **Queue Overview**
  - queue cards with status, priority, concurrency, rate limits, and counters

- **Queue Configuration**
  - update queue description
  - update priority
  - update concurrency
  - update rate limit settings
  - pause / resume queue

- **Create Jobs**
  - create `send-email`
  - create `generate-report`
  - create `fail-demo`
  - create recurring scheduled jobs

- **Jobs Table**
  - recent jobs for selected queue
  - status, attempts, priority, timestamps

- **Scheduled Jobs**
  - recurring cron definitions for selected queue

- **Workers**
  - worker name
  - status
  - started at
  - heartbeat

- **Dead Letter Queue**
  - permanently failed jobs
  - requeue action

---

# 8. Project Structure

```bash
relay-working-mvp-submission/
├─ apps/
│  ├─ api/                # Express API
│  ├─ worker/             # Worker polling + execution service
│  └─ web/                # React + Vite dashboard
│
├─ packages/
│  ├─ db/                 # Prisma schema + Prisma client
│  ├─ config/             # shared env / config helpers
│  └─ shared/             # shared types / retry helpers / utilities
│
├─ docker-compose.yml
├─ package.json
├─ README.md
├─ API_DOCS.md
└─ design.md
```

---

# 9. Setup Instructions

## 1) Clone repository

```bash
git clone <your-repo-url>
cd relay-working-mvp-submission
```

## 2) Install dependencies

```bash
npm install
```

## 3) Start PostgreSQL with Docker

```bash
docker compose up -d
```

## 4) Generate Prisma client

```bash
npm run prisma:generate
```

## 5) Run database migrations

```bash
npm run prisma:migrate
```

## 6) Seed / bootstrap demo data
If your repo includes a seed command, run:

```bash
npm run seed
```

If not, create a demo project and queue from the dashboard or Postman after startup.

---

# 10. Environment Variables

Create a root `.env` file.

Example:

```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/relay?schema=public"
JWT_SECRET="super-secret-key"
PORT=4000

WORKER_NAME=worker-1
WORKER_POLL_INTERVAL_MS=1000
WORKER_HEARTBEAT_INTERVAL_MS=5000
WORKER_CLAIM_BATCH_SIZE=10
WORKER_LEASE_SECONDS=30
```

Adjust values to match your local setup.

---

# 11. Running the System

## Start API
```bash
npm run dev:api
```

## Start Worker
```bash
npm run dev:worker
```

## Start Frontend
```bash
npm run dev -w @relay/web
```

Then open the Vite URL shown in the terminal, typically:

```txt
http://localhost:5173
```

---

# 12. GitHub Actions & Deployment

Relay includes comprehensive GitHub Actions workflows for CI/CD and deployment to multiple hosting platforms.

## CI/CD Workflows

### Continuous Integration (`ci.yml`)
Runs on every push to `main`/`develop` and on pull requests.

**Performs:**
- Installs dependencies
- Generates Prisma client
- Runs database migrations with PostgreSQL service
- Seeds demo data
- Runs test suite
- Builds all packages

### Docker Build (`docker-build.yml`)
Builds and pushes Docker images to GitHub Container Registry (GHCR) on `main` branch and tags.

**Services:**
- `api` - Express API server
- `worker` - Job processing worker
- `web` - React dashboard

**Images pushed to:**
```
ghcr.io/<owner>/<repo>-api:latest
ghcr.io/<owner>/<repo>-worker:latest
ghcr.io/<owner>/<repo>-web:latest
```

### Deployment (`deploy.yml`)
Enables deployment to Railway, Render, Fly.io, or Heroku with environment-specific configurations.

**Supports:**
- Automatic deployment on `main` branch
- Manual deployment via workflow dispatch
- Staging and production environments
- Multiple hosting platform options

## Deployment Options

### 1. Railway (Recommended for MVP)
Simplest deployment with built-in PostgreSQL.

```bash
# 1. Create Railway account
# 2. Get token: railway login && railway token
# 3. Add RAILWAY_TOKEN to GitHub secrets
# 4. Push to main or trigger manually
```

### 2. Render
Native Node.js support with PostgreSQL.

### 3. Fly.io
Global deployment with competitive pricing.

### 4. Heroku
Classic platform with good scaling support.

## Local Docker Deployment

Deploy all services locally with Docker Compose:

```bash
docker-compose -f docker-compose.prod.yml up -d
```

Services available at:
- API: `http://localhost:4000`
- Web: `http://localhost:5173`
- Database: `localhost:5432`

**See [`DEPLOYMENT.md`](DEPLOYMENT.md) for detailed setup instructions.**

---

# 13. API Overview

Below is the high-level API surface.

## Auth
- `POST /api/v1/auth/login`

## Projects
- `GET /api/v1/projects`
- `POST /api/v1/projects`

## Queues
- `GET /api/v1/projects/:projectId/queues`
- `POST /api/v1/projects/:projectId/queues`
- `PATCH /api/v1/queues/:queueId`
- `POST /api/v1/queues/:queueId/pause`
- `POST /api/v1/queues/:queueId/resume`
- `GET /api/v1/queues/:queueId/stats`

## Jobs
- `GET /api/v1/queues/:queueId/jobs`
- `POST /api/v1/queues/:queueId/jobs`
- `POST /api/v1/queues/:queueId/jobs/batch`

## Scheduled / Recurring Jobs
- `GET /api/v1/queues/:queueId/scheduled-jobs`
- `POST /api/v1/queues/:queueId/scheduled-jobs`
- `PATCH /api/v1/scheduled-jobs/:scheduledJobId`
- `DELETE /api/v1/scheduled-jobs/:scheduledJobId`

## Workers
- `GET /api/v1/workers`

## Dead Letter Queue
- `GET /api/v1/dead-letter`
- `POST /api/v1/dead-letter/:entryId/requeue`

## Job Logs / Executions
Depending on your final route structure in the API server, you may also expose:

- `GET /api/v1/jobs/:jobId/logs`
- `GET /api/v1/jobs/:jobId/executions`

For exact request / response examples, see **`API_DOCS.md`**.

---

# 14. Worker Lifecycle

Relay workers continuously perform the following loop:

1. **register / ensure worker record**
2. **send periodic heartbeat**
3. **scan due recurring schedules**
4. **materialize recurring jobs into runnable jobs**
5. **scan eligible queues**
6. **skip paused queues**
7. **enforce queue-level rate limits**
8. **atomically claim runnable jobs**
9. **execute jobs concurrently**
10. **record execution + log events**
11. **retry / dead-letter failures**
12. **gracefully stop on shutdown**

---

# 15. Reliability Features

## Atomic Claiming
Workers claim jobs atomically using **PostgreSQL row-level locking**:

- `SELECT ... FOR UPDATE SKIP LOCKED`

This prevents multiple workers from claiming the same job at the same time.

---

## Retry Strategies
Relay supports configurable retry behavior through retry policies and worker-side retry scheduling.

Supported strategies:

- **Fixed delay**
- **Linear backoff**
- **Exponential backoff**

When a job fails and attempts remain, the worker computes the next retry delay and reschedules the job.

---

## Dead Letter Queue
If a job permanently fails after exhausting attempts:

- job status becomes `DEAD_LETTER`
- a `DeadLetterJob` row is created
- failure information is preserved
- the dashboard allows requeueing

---

## Queue Rate Limiting
Queues may optionally define:

- `rateLimitCount`
- `rateLimitWindowSec`

The worker checks recent execution activity for the queue and skips claiming when the configured throughput threshold has already been reached inside the time window.

---

## Job Dependencies
Relay also includes a dependency model through `JobDependency`.

This allows child jobs to wait until parent jobs have completed before becoming eligible for execution.

The current implementation has test coverage for dependency blocking behavior and is designed to be extended into richer workflow orchestration later.

---

## Job Logs & Execution History
Relay stores both:

### `JobExecution`
Structured attempt-level execution history:
- worker assignment
- attempt number
- duration
- success / failure state

### `JobLog`
Operational lifecycle events such as:
- `CLAIMED`
- `STARTED`
- `COMPLETED`
- `FAILED`
- `RETRY_SCHEDULED`
- `RECURRING_MATERIALIZED`
- `RATE_LIMIT_SKIPPED`
- `BLOCKED_BY_DEPENDENCY`

This separation makes the platform easier to debug operationally while preserving normalized execution history.

---

# 16. Testing

Relay includes automated tests for critical scheduler behavior.

## Run tests
```bash
npm test
```

## Covered test scenarios
- batch job creation
- retry flow
- dead-letter handling
- recurring job materialization
- scheduled jobs
- job logs
- job dependencies

Example test result:

```bash
✓ scheduled-jobs.test.ts
✓ batch-jobs.test.ts
✓ retry-job.test.ts
✓ dead-letter.test.ts
✓ recurring-materialization.test.ts
✓ job-logs.test.ts
✓ job-dependencies.test.ts
```

---

# 17. Design Decisions & Trade-offs

## 1) PostgreSQL as the source of truth
Rather than introducing Kafka / Redis / separate broker infrastructure, Relay uses PostgreSQL as the scheduler state store.

### Why
- simpler local development
- strong transactional guarantees
- easy atomic claim logic with `FOR UPDATE SKIP LOCKED`
- suitable for a production-inspired MVP

### Trade-off
At very large scale, a dedicated event / stream system may be better for throughput and fan-out.

---

## 2) Row-level locking for safe concurrent claims
Workers claim jobs atomically inside a transaction using row locks.

### Benefit
- prevents duplicate claims across workers
- easy to reason about
- fits relational scheduler design well

---

## 3) Separate `ScheduledJob` definitions from runtime `Job` rows
Recurring schedules are stored as schedule definitions and materialized into executable jobs by the worker.

### Benefit
- keeps runtime jobs and schedule definitions separate
- preserves auditability of recurring schedule creation
- makes pause / update / delete of recurring jobs cleaner

---

## 4) Job logs + execution rows both exist
Relay stores both:
- **JobExecution** → structured execution attempt records
- **JobLog** → lifecycle / operational event stream

### Benefit
- execution attempts remain structured
- operator-facing lifecycle visibility is richer
- dashboard can show both summary and event timeline

---

## 5) Rate limiting at queue level
Rate limiting was implemented at queue scope rather than per-job-type scope to keep the MVP operationally simple.

### Benefit
- easy to configure
- aligns with queue ownership model

### Trade-off
Per-job-type or per-tenant rate limiting would be a useful extension.

---

## 6) Dependencies implemented at scheduler layer
Job dependencies are represented relationally using `JobDependency`.

### Benefit
- supports workflow-like orchestration without adding a separate workflow engine
- easy to validate blocking behavior in tests
- cleanly extendable later into DAG workflows and dependency-aware UI

---

# 18. Implemented vs Assignment Bonus Scope

## Fully implemented in this submission
- Authentication with demo login
- Projects and queue management
- Queue pause / resume and configuration updates
- Immediate, delayed, batch, and recurring scheduled jobs
- Worker polling, heartbeats, graceful shutdown, and concurrent execution
- Atomic job claiming with PostgreSQL row-level locking
- Retry handling and dead-letter queue flow
- Job execution history and job logs
- Queue rate limiting
- Job dependency support
- Web dashboard for queue operations, jobs, workers, recurring schedules, and DLQ recovery
- Automated tests for critical scheduler functionality

## Partially implemented / extension-ready
- Full retry policy management UI / CRUD workflow
- Rich workflow dependency authoring from the dashboard
- Live updates via WebSockets
- AI-generated failure summaries
- Role-based access control beyond demo auth
- Queue sharding / event-driven execution / distributed lock service

---

# 19. Screenshots

Create a folder like:

```bash
docs/screenshots/
```

and add your dashboard screenshots there.

Example markdown:

```md
## Dashboard Overview
![Dashboard Overview](docs/screenshots/dashboard-overview.png)

## Queue Overview
![Queue Overview](docs/screenshots/queue-overview.png)

## Queue Configuration + Create Jobs
![Queue Config](docs/screenshots/queue-config-jobs.png)

## Jobs / Scheduled Jobs / Workers / DLQ
![Jobs Workers DLQ](docs/screenshots/jobs-workers-dlq.png)
```

Suggested screenshot names:
- `dashboard-overview.png`
- `queue-overview.png`
- `queue-config-jobs.png`
- `jobs-workers-dlq.png`

---

# 20. Future Improvements

The current implementation is a strong production-inspired MVP. Natural next steps would be:

## Backend
- role-based access control
- per-project / per-tenant authorization
- workflow / DAG execution APIs
- queue sharding
- distributed locking across multi-node schedulers
- event-driven execution using Kafka / Redis streams
- stronger idempotency key support
- richer retry policy CRUD

## Frontend
- job detail drawer with logs + execution timeline
- queue charts / throughput graphs
- live updates via WebSocket
- filters / pagination controls on every table
- retry policy editor UI
- recurring schedule edit modal
- dependency graph visualization

## Reliability / Infra
- structured tracing / OpenTelemetry
- Prometheus metrics
- Grafana dashboards
- alerting on worker heartbeat loss
- containerized deployment manifests
- CI pipeline with lint + test + migration checks

---

# Conclusion

Relay demonstrates a production-inspired scheduler architecture with:

- clean queue ownership boundaries
- atomic job claiming
- retries and DLQ
- recurring scheduling
- worker observability
- rate limiting and dependency handling
- frontend operations dashboard
- relational schema designed for scheduler workloads

It is intentionally built as a **maintainable systems project** rather than a minimal CRUD application, with emphasis on **concurrency safety, execution visibility, and extensibility**.