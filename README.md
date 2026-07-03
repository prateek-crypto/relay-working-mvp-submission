# Relay - Distributed Job Scheduler

This is my internship project on a **distributed job scheduler / background job processing system** built using **Node.js, TypeScript, PostgreSQL, Prisma and React**.

The main goal of this project was to understand how background jobs work in real backend systems.  
Instead of doing everything inside a normal API request, some tasks can be pushed into a queue and processed later by a worker in the background.

Examples of such tasks:
- sending emails
- generating reports
- retrying failed operations
- moving failed jobs to a dead-letter queue

This project is a **working MVP** mainly focused on backend job flow, queue handling and worker processing.  
The frontend is kept simple and is only used for viewing queues, jobs, workers and dead-letter jobs.

---

# Why I built this

I wanted to build something beyond a normal CRUD project and understand how backend systems handle **asynchronous work**.

In many real applications, some tasks should not be processed directly inside the API request because they can be slow or may fail independently.  
For example:
- email sending
- report generation
- notifications
- retrying failed work

So I built this project to learn:
- how job queues work
- how workers process jobs in the background
- how retries are handled
- how dead-letter queues work
- how queue state can be monitored

---

# What this project does

This project has 3 main parts:

## 1. API
The API is used to:
- login
- create jobs
- get projects and queues
- get jobs of a queue
- pause / resume queues
- get queue stats
- get workers
- get dead-letter jobs
- requeue dead-letter jobs

## 2. Worker
The worker runs in the background and:
- polls queues
- picks queued jobs
- executes them
- retries failed jobs
- moves failed jobs to dead-letter when retry limit is crossed

## 3. Frontend dashboard
The frontend dashboard is simple and is used to:
- view queues
- create demo jobs
- see jobs and their status
- see active workers
- see dead-letter jobs
- requeue failed jobs

---

# Features implemented

## Queue and job handling
- create jobs inside a queue
- support multiple queues
- store job payload and metadata
- keep job status in the database

## Worker processing
- worker registration in database
- worker heartbeat
- polling active queues
- claiming jobs
- executing jobs based on job type

## Retry logic
- failed jobs are retried based on retry policy
- next retry time is stored using `availableAt`

## Dead-letter queue
- if max retry attempts are reached, the job moves to dead-letter
- failure reason is stored for debugging

## Dead-letter requeue
- failed jobs can be requeued again from API / dashboard

## Queue controls
- queue can be paused
- queue can be resumed
- jobs inside a paused queue remain queued until resumed

## Monitoring
- queue stats
- job list
- worker list
- dead-letter list

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
   - retry if attempts are left
   - otherwise move it to `DEAD_LETTER`

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
- demo user
- demo project
- demo queues
- retry policy

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

This starts the background worker that processes jobs.

When it is working, you will see logs like:

```txt
[worker] started: worker-1
[worker] claimed 1 job(s) ...
[worker] executing job ...
[worker] job completed ...
```

### Terminal 3 — Start Frontend

```bash
npm run dev:web
```

This starts the React dashboard, usually on:

```txt
http://localhost:5173
```

---

# Run all together

If you want to run all three together in one command:

```bash
npm run dev
```

---

# Demo login / testing

Once API + Worker + Web are running:

1. Open the frontend in browser:
   - `http://localhost:5173`

2. Login using the seeded demo user.

3. From the dashboard you can:
   - view queues
   - create `send-email` job
   - create `generate-report` job
   - create `fail-demo` job
   - see workers
   - see dead-letter jobs
   - pause / resume queue
   - requeue dead-letter jobs

---

# Demo flows tested

I tested the following flows in this project:

## 1. Login
- logged in with demo user
- received JWT token
- used token in protected routes

## 2. Send-email job
- created a `send-email` job
- worker picked it
- job completed successfully

## 3. Generate-report job
- created a `generate-report` job
- worker processed it successfully

## 4. Fail-demo retry flow
- created a `fail-demo` job
- worker retried it
- after max attempts it moved to dead-letter

## 5. Dead-letter requeue
- requeued a dead-letter job
- worker picked it again

## 6. Pause / resume queue
- paused queue
- created a job while queue was paused
- job stayed queued
- resumed queue
- worker processed it after resume

---

## Architecture Diagram

```mermaid
flowchart TB
    user[User / Admin]
    web[Web Dashboard<br/>React + Vite]
    api[API Service<br/>Node.js + Express + TypeScript]
    worker[Worker Service<br/>Background Job Processor]
    db[(PostgreSQL)]
    prisma[Prisma ORM]

    user --> web
    web -->|Login, create jobs, view queues, pause/resume queues, requeue dead-letter jobs| api

    api --> prisma
    worker --> prisma
    prisma --> db

    api -->|Create job / Fetch data / Queue actions| db
    worker -->|Poll queues / Claim jobs / Update job state| db
```

## ER Diagram

```mermaid
erDiagram
    PROJECT ||--o{ QUEUE : contains
    RETRY_POLICY ||--o{ QUEUE : applied_to
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