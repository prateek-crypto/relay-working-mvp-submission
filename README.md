# Relay — Distributed Job Scheduler (Node.js MVP)

Relay is a distributed background job scheduler built in **Node.js + TypeScript** to explore reliable asynchronous job execution using **PostgreSQL row-level locking**.

This MVP intentionally focuses on the core engineering problems of a job scheduler instead of trying to mimic a full production platform.

---

## 1) What the MVP implements

### Backend
- demo login with JWT
- project and queue listing
- immediate job creation
- queue pause / resume
- worker polling and worker heartbeat updates
- atomic job claiming with `FOR UPDATE SKIP LOCKED`
- mocked job execution handlers
- retry on failure using retry policy
- dead-letter movement after max attempts
- manual retry and dead-letter requeue endpoints
- job execution history endpoint

### Frontend
- queue overview cards
- jobs table
- workers table
- dead-letter table with requeue action
- create demo jobs from dashboard

### Demo job types
- `send-email`
- `generate-report`
- `fail-demo`

---

## 2) Why PostgreSQL `FOR UPDATE SKIP LOCKED` was chosen

The hardest problem in a distributed worker system is preventing duplicate execution when multiple workers poll the same queue at the same time.

Relay solves this by claiming jobs inside a single PostgreSQL transaction:

1. select eligible queued jobs ordered by priority and age
2. lock them using `FOR UPDATE SKIP LOCKED`
3. update them to `CLAIMED` with a lease owner and lease expiry
4. commit the transaction

This gives the MVP a concurrency mechanism that is much closer to a real scheduler than a naive polling loop.

---

## 3) What was intentionally left out

To keep the submission believable and finishable as an internship project, the following features were intentionally deferred:

- queue sharding
- Kafka / event-driven execution
- workflow DAG dependencies
- WebSocket live updates
- advanced RBAC
- AI-generated failure summaries

These are good future extensions, but they are not necessary to demonstrate the scheduler core.

---

## Local run

```bash
cp .env.example .env
docker compose up -d
npm install
npm run prisma:generate
npm run prisma:migrate
npm run seed
npm run dev
```

### Demo credentials
- `demo@relay.dev`
- `password123`
