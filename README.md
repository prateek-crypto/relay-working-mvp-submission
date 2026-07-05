# Relay - Distributed Job Scheduler

This is my internship project on a **distributed job scheduler / background job processing system** built using **Node.js, TypeScript, PostgreSQL, Prisma, and React**.

The main goal of this project was to understand how background jobs work in real backend systems.  
Instead of doing everything inside a normal API request, some tasks can be pushed into a queue and processed later by a worker in the background.

Examples of such tasks:
- Sending emails
- Generating reports
- Retrying failed operations
- Moving failed jobs to a dead-letter queue

This project is a **working MVP** mainly focused on backend job flow, queue handling, and worker processing.  
The frontend is kept simple and is only used for viewing queues, jobs, workers, and dead-letter jobs.

---

# Why I built this

I wanted to build something beyond a normal CRUD project and understand how backend systems handle **asynchronous work**.

In many real applications, some tasks should not be processed directly inside the API request because they can be slow or may fail independently.  
For example:
- Email sending
- Report generation
- Notifications
- Retrying failed work

So I built this project to learn:
- How job queues work
- How workers process jobs in the background
- How retries are handled
- How dead-letter queues work
- How queue state can be monitored

---

# What this project does

This project has 3 main parts:

## 1. API
The API is used to:
- Login
- Create jobs
- Get projects and queues
- Get jobs of a queue
- Pause / resume queues
- Get queue stats
- Get workers
- Get dead-letter jobs
- Requeue dead-letter jobs

## 2. Worker
The worker runs in the background and:
- Polls queues
- Picks queued jobs
- Executes them
- Retries failed jobs
- Moves failed jobs to dead-letter when retry limit is crossed

## 3. Frontend dashboard
The frontend dashboard is simple and is used to:
- View queues
- Create demo jobs
- See jobs and their status
- See active workers
- See dead-letter jobs
- Requeue failed jobs

---

# Architecture & Database Design

## High-Level System Architecture
```mermaid
flowchart TB
    user[User / Admin]
    web["Web Dashboard\nReact + Vite"]
    api["API Service\nNode.js + Express + TypeScript"]
    worker["Worker Service\nBackground Job Processor"]
    db[("(PostgreSQL)")]
    prisma[Prisma ORM]

    user --> web
    web -->|Login, create jobs, view queues, pause/resume queues, requeue dead-letter jobs| api
    api --> prisma
    worker --> prisma
    prisma --> db
    api -->|Create job / Fetch data / Queue actions| db
    worker -->|Poll queues / Claim jobs / Update job state| db
```

## Entity-Relationship (ER) Diagram
```mermaid
erDiagram
    PROJECT ||--o{ QUEUE : contains
    RETRY_POLICY ||--o{ QUEUE : applied
    QUEUE ||--o{ JOB : stores
    WORKER ||--o{ JOB : claims
    JOB ||--o{ JOB_EXECUTION : creates
    WORKER ||--o{ JOB_EXECUTION : runs
    JOB ||--o| DEAD_LETTER_JOB : becomes

    PROJECT {
        uuid id PK
        string name
        string slug
        datetime createdAt
    }
    RETRY_POLICY {
        uuid id PK
        string name
        string strategy
        int maxAttempts
        int baseDelayMs
        datetime createdAt
    }
    QUEUE {
        uuid id PK
        uuid projectId FK
        string name
        boolean isPaused
        int defaultPriority
        int concurrencyLimit
        uuid retryPolicyId FK
        datetime createdAt
    }
    JOB {
        uuid id PK
        uuid queueId FK
        string jobType
        json payloadJson
        string status
        int priority
        int attemptCount
        int maxAttempts
        datetime availableAt
        uuid claimedByWorkerId FK
        datetime claimedAt
        datetime leaseExpiresAt
        datetime completedAt
        string lastError
        datetime createdAt
    }
    WORKER {
        uuid id PK
        string workerName
        string status
        datetime lastHeartbeatAt
        datetime createdAt
    }
    JOB_EXECUTION {
        uuid id PK
        uuid jobId FK
        uuid workerId FK
        int attemptNumber
        string status
        datetime startedAt
        datetime finishedAt
        string errorMessage
        datetime createdAt
    }
    DEAD_LETTER_JOB {
        uuid id PK
        uuid jobId FK
        string failureReason
        int finalAttempt
        string failureSummary
        datetime createdAt
    }
```

---

# Features implemented

## Queue and job handling
- Create jobs inside a queue
- Support multiple queues
- Store job payload and metadata
- Keep job status in the database

## Worker processing
- Worker registration in database
- Worker heartbeat
- Polling active queues
- Claiming jobs
- Executing jobs based on job type

## Retry logic
- Failed jobs are retried based on retry policy
- Next retry time is stored using `availableAt`

## Dead-letter queue
- If max retry attempts are reached, the job moves to dead-letter
- Failure reason is stored for debugging

## Dead-letter requeue
- Failed jobs can be requeued again from API / dashboard

## Queue controls
- Queue can be paused
- Queue can be resumed
- Jobs inside a paused queue remain queued until resumed

## Monitoring
- Queue stats
- Job list
- Worker list
- Dead-letter list

---

# Job types used in this project

For demo/testing, I used these job types:

## `send-email`
A demo email job.

## `generate-report`
 A demo report generation job.

## `fail-demo`
A job that intentionally fails so retry and dead-letter flow can be tested.

---

# Tech stack

## Backend
- Node.js
- TypeScript
- Express.js
- Prisma
- PostgreSQL
- JWT authentication
- Zod validation

## Frontend
- React
- Vite

## Other tools
- npm workspaces
- Prisma Studio
- Postman

---

# Project structure

```txt
relay-working-mvp-submission/
│
├── apps/
│   ├── api/         # backend API
│   ├── worker/      # background worker
│   └── web/         # frontend dashboard
│
├── packages/
│   ├── db/          # prisma schema, migrations, seed, db client
│   ├── config/      # environment config
│   └── shared/      # shared helpers and retry logic
│
├── package.json
└── README.md
```

---

# Job flow in this project

A job usually goes through the following states:

## 1. QUEUED
Job is created and waiting in the queue.

## 2. CLAIMED
Worker has picked the job from the queue.

## 3. RUNNING
Worker is currently executing the job handler.

## 4. COMPLETED
Job finished successfully.

## 5. DEAD_LETTER
Job failed multiple times and has been moved to the dead-letter queue.

---

# High level working

The high-level flow of the system is:

1. A job is created from API or frontend.
2. The job is stored in the database with status `QUEUED`.
3. Worker keeps polling active queues.
4. Worker claims a ready job and marks it `CLAIMED` / `RUNNING`.
5. Worker executes the correct handler depending on job type.
6. If execution succeeds, job becomes `COMPLETED`.
7. If execution fails:
   - Retry if attempts are left
   - Otherwise move it to `DEAD_LETTER`

---

# Basic database relation idea

- One **Project** can have many **Queues**
- One **Queue** can have many **Jobs**
- One **Queue** can use one **RetryPolicy**
- One **Job** can have many **JobExecutions**
- One **Job** can move to **DeadLetterJob**
- One **Worker** can execute many jobs

---

# API routes used

## Auth
- `POST /api/v1/auth/login`

## Projects / queues
- `GET /api/v1/projects`
- `GET /api/v1/projects/:projectId/queues`

## Jobs
- `POST /api/v1/queues/:queueId/jobs`
- `GET /api/v1/queues/:queueId/jobs`

## Queue actions
- `GET /api/v1/queues/:queueId/stats`
- `POST /api/v1/queues/:queueId/pause`
- `POST /api/v1/queues/:queueId/resume`

## Workers
- `GET /api/v1/workers`

## Dead-letter
- `GET /api/v1/dead-letter`
- `POST /api/v1/dead-letter/:deadLetterId/requeue`

---

# How to run locally

## 1. Clone the project

```bash
git clone https://github.com/prateek-crypto/relay-working-mvp-submission.git
cd relay-working-mvp-submission
```

## 2. Install dependencies

```bash
npm install
```

## 3. Create root `.env`

Create a `.env` file in the project root with:

```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/relay?schema=public"
JWT_SECRET="change-this-secret"
JWT_EXPIRES_IN="7d"
API_PORT=4000
NODE_ENV=development

WORKER_NAME="worker-1"
WORKER_POLL_INTERVAL_MS=3000
WORKER_HEARTBEAT_INTERVAL_MS=8000
WORKER_CLAIM_BATCH_SIZE=5
WORKER_LEASE_SECONDS=30

VITE_API_BASE_URL="http://localhost:4000/api/v1"
```

## 4. Make sure PostgreSQL is running

The project depends on PostgreSQL.  
Make sure a database named `relay` exists and your credentials match the `.env`.

Current database config used in this project:

- database name: `relay`
- username: `postgres`
- password: `postgres`

## 5. Generate Prisma client

```bash
npm run prisma:generate
```

## 6. Run migration

```bash
npm run prisma:migrate
```

## 7. Seed demo data

```bash
npm run seed
```

This creates demo data like:
- Demo user
- Demo project
- Demo queues
- Retry policy

---

# Starting the project

The project has 3 running parts:
- API
- Worker
- Frontend

## Recommended way: open 3 terminals

### Terminal 1 — Start API

```bash
npm run dev:api
```

This starts the backend API on:
```txt
http://localhost:4000
```

### Terminal 2 — Start Worker

```bash
npm run dev:worker
```