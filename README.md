# Relay - Distributed Job Scheduler

This is my internship project on a **distributed job scheduler / background job processing system** built using **Node.js, TypeScript, PostgreSQL, Prisma and React**.

The main idea of this project is to understand how background jobs work in real systems.  
Instead of doing everything directly in the API request, some tasks can be pushed into a queue and handled by a worker in the background.

Examples:
- sending an email
- generating a report
- retrying failed work
- storing failed jobs in dead-letter queue

This project is a **working MVP**, mainly focused on backend logic and job flow.  
Frontend is kept simple and only used to see queues, jobs, workers and dead-letter jobs.

---

# What this project does

This project has 3 parts:

## 1. API
The API is used to:
- login
- create jobs
- get queues
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
- moves failed jobs to dead-letter if retry limit is crossed

## 3. Frontend dashboard
The frontend is a simple dashboard where I can:
- see all queues
- create demo jobs
- see jobs and their status
- see active workers
- see dead-letter jobs
- requeue failed jobs

---

# Why I built this

I wanted to build something beyond a normal CRUD project and understand how backend systems handle **asynchronous tasks**.

In many applications, some work should not happen directly during the API request.  
For example:
- email sending
- report generation
- notification processing
- retrying failed operations

So I built this project to learn:
- how job queues work
- how workers process jobs
- how retries are handled
- how dead-letter queues work
- how queue state can be monitored

---

# Features implemented

## Queue and job handling
- create jobs inside a queue
- support multiple queues
- store job payload and metadata
- keep job status in database

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
- if max retry attempts are reached, job moves to dead-letter
- failure reason is stored

## Dead-letter requeue
- failed jobs can be requeued again from API / dashboard

## Queue controls
- queue can be paused
- queue can be resumed
- paused queue jobs remain queued until resumed

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
│   ├── config/      # env config
│   └── shared/      # shared helpers and retry logic
│
├── package.json
└── README.md
Job flow in this project

A job usually goes through the following states:

1. QUEUED

Job is created and waiting in queue.

2. CLAIMED

Worker has picked the job.

3. RUNNING

Worker is currently executing it.

4. COMPLETED

Job finished successfully.

5. DEAD_LETTER

Job failed multiple times and has been moved to dead-letter queue.

High level working
A job is created from API or frontend.
Job is stored in database with status QUEUED.
Worker keeps polling active queues.
Worker claims a job and marks it CLAIMED / RUNNING.
Worker runs the correct handler depending on job type.
If success -> job becomes COMPLETED
If failure:
retry if attempts are left
otherwise move to DEAD_LETTER
Simple architecture
Basic ER relation idea
One Project can have many Queues
One Queue can have many Jobs
One Queue can use one RetryPolicy
One Job can have many JobExecutions
One Job can move to DeadLetterJob
One Worker can execute many jobs
API routes used
Auth
POST /api/v1/auth/login
Projects / queues
GET /api/v1/projects
GET /api/v1/projects/:projectId/queues
Jobs
POST /api/v1/queues/:queueId/jobs
GET /api/v1/queues/:queueId/jobs
Queue actions
GET /api/v1/queues/:queueId/stats
POST /api/v1/queues/:queueId/pause
POST /api/v1/queues/:queueId/resume
Workers
GET /api/v1/workers
Dead-letter
GET /api/v1/dead-letter
POST /api/v1/dead-letter/:deadLetterId/requeue
How to run locally
1. Clone the project
git clone <your-repo-url>
cd relay-working-mvp-submission
2. Install dependencies
npm install
3. Add .env

Create a root .env file like this:

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
Database setup
Generate Prisma client
npm run prisma:generate
Run migration
npm run prisma:migrate
Seed data
npm run seed

This creates demo data like:

demo user
demo project
demo queues
retry policy
Run the project
Start API
npm run dev:api
Start worker
npm run dev:worker
Start frontend
npm run dev:web
Start all together
npm run dev
Demo flows tested

I tested these flows in the project:

1. Login
logged in with demo user
got JWT token
used token in protected routes
2. Send-email job
created send-email job
worker picked it
job completed successfully
3. Generate-report job
created generate-report job
worker processed it successfully
4. Fail-demo retry flow
created fail-demo job
worker retried it
after max attempts it moved to dead-letter
5. Dead-letter requeue
requeued a dead-letter job
worker picked it again
6. Pause / resume queue
paused queue
created job while paused
job stayed queued
resumed queue
worker processed it after resume

Recommended way to run during testing

Open 3 terminals in the project root.
1)**.npm run dev:api
2).npm run dev:worker
3).npm run dev:web**

This makes it easier to see:
API logs
worker logs
frontend separately
API runs on **http://localhost:4000**
**for running all together 
# npm run dev**
First start PostgreSQL

Your whole project depends on the database.

Make sure PostgreSQL is running and that the database relay exists.

Your .env currently uses:

DATABASE_URL="postgresql://postgres:postgres@localhost:5432/relay?schema=public"

So the required DB is:

database name → relay
user → postgres
password → postgres
2) Install dependencies once

If not already done:

npm install

You only need this when setting up the project or after dependency changes.

3) Make sure .env exists in project root

Root .env should contain:

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
4) Generate Prisma client

Run once after fresh setup or schema changes:

npm run prisma:generate
5) Run database migration

If DB is fresh / not set up yet:

npm run prisma:migrate
6) Seed the database

This creates demo user, project, queues, retry policy etc.

npm run seed
7) Now start the actual project

Your project has 3 running parts:

API
Worker
Frontend
Recommended way: 3 separate terminals
Terminal 1 — Start API

Open a new PowerShell window:

cd "C:\Users\LENOVO\OneDrive\Desktop\relay-working-mvp-submission"
npm run dev:api

This starts the backend API on port 4000.

Terminal 2 — Start Worker

Open another PowerShell window:

cd "C:\Users\LENOVO\OneDrive\Desktop\relay-working-mvp-submission"
npm run dev:worker

This starts the background worker that processes jobs.

When it works, you’ll see logs like:

[worker] started: worker-1
[worker] claimed 1 job(s) ...
[worker] executing job ...
[worker] job completed ...
Terminal 3 — Start Frontend

Open another PowerShell window:

cd "C:\Users\LENOVO\OneDrive\Desktop\relay-working-mvp-submission"
npm run dev:web

This starts the React dashboard, usually on:

http://localhost:5173
8) Login and use project

Once API + Worker + Web are all running:

Open frontend in browser

Usually:

```
http://localhost:5173
```
Then login using seeded demo credentials

Use the demo account you seeded earlier.

After login you can:

view queues
create send-email job
create generate-report job
create fail-demo job
see workers
see dead-letter jobs
pause/resume queue
requeue dead-letter jobs




```
# ## Architecture Diagram
```

```mermaid
flowchart TB
    user[User / Admin]
    web[Web Dashboard<br/>React + Vite]
    api[API Service<br/>Node.js + Express + TypeScript]
    worker[Worker Service<br/>Background Job Processor]
    db[(PostgreSQL)]
    prisma[Prisma ORM]

    user --> web
    web -->|Login, create jobs, pause/resume queues,<br/>view stats, workers, dead-letter jobs| api

    api --> prisma
    worker --> prisma
    prisma --> db

    api -->|Create job| db
    api -->|Read queues / jobs / stats| db
    api -->|Pause / resume queue| db
    api -->|Requeue dead-letter job| db

    worker -->|Poll active queues| db
    worker -->|Claim queued jobs| db
    worker -->|Execute send-email / generate-report / fail-demo| db
    worker -->|Retry failed jobs| db
    worker -->|Move exhausted jobs to dead-letter| db
    worker -->|Heartbeat update| db




```
  #   ErDiagram
```




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