# Relay MVP Design Decisions

This document explains the main design choices made while building the Relay distributed job scheduling MVP.

---

# 1. Goal of the project

The goal of this project was to build a production-inspired distributed background job scheduling platform with:

- authenticated access
- project and queue management
- asynchronous job execution
- retries and dead-letter handling
- worker heartbeat tracking
- delayed, scheduled, recurring, and batch jobs
- a dashboard to monitor queues, jobs, workers, and failures

The focus of the implementation was reliability, clear separation of responsibilities, and making the system easy to reason about during development.

---

# 2. High-level architecture

The project is split into three main application layers:

## API service
Responsible for:
- exposing REST endpoints
- validating input
- creating queues, jobs, scheduled jobs, and retry actions
- providing data for the dashboard

## Worker service
Responsible for:
- polling queues
- promoting due scheduled jobs into runnable jobs
- materializing recurring jobs from cron definitions
- atomically claiming jobs
- executing handlers
- applying retry / dead-letter logic
- sending worker heartbeats

## Web dashboard
Responsible for:
- showing queue health
- showing jobs and dead-letter entries
- showing worker status
- allowing queue pause/resume and dead-letter requeue actions

The shared PostgreSQL database acts as the source of truth between the API and worker services.

---

# 3. Why PostgreSQL + Prisma

## PostgreSQL
PostgreSQL was chosen because the project is highly relational. The system contains linked entities such as:

- users
- projects
- queues
- jobs
- scheduled jobs
- retry policies
- workers
- job executions
- dead-letter entries

These relationships are easier to model and query in a relational database than in a document store.

PostgreSQL also fits job scheduling systems well because it provides:
- transactions
- consistency
- indexing
- filtering and aggregation for queue statistics
- reliable persistent storage for job state

## Prisma
Prisma was used to simplify schema management and reduce low-level SQL boilerplate.

Benefits in this project:
- clear schema definition
- typed database queries in TypeScript
- easier migrations
- less repetitive code for inserts, relations, and updates
- faster iteration while building the MVP

Trade-off:
- Prisma abstracts some SQL behavior. If this system needed to scale much further, some hot paths such as job claiming might be rewritten using raw SQL.

---

# 4. Why recurring schedules are stored separately from normal jobs

A key design decision was to keep recurring schedule definitions separate from runnable job instances.

## `Job`
The `Job` table stores actual runnable jobs that move through the lifecycle:

- `QUEUED`
- `SCHEDULED`
- `CLAIMED`
- `RUNNING`
- `COMPLETED`
- `DEAD_LETTER`

## `ScheduledJob`
The `ScheduledJob` table stores recurring schedule definitions such as:
- cron expression
- payload
- queue
- next run time
- paused state

The worker periodically checks for due recurring definitions and materializes them into real `Job` rows.

## Why this separation helps
If recurring schedules were stored directly as jobs, it would be hard to represent both:
- the reusable recurring schedule template
- the individual execution instances produced by that template

Separating them gives a cleaner design:

- `ScheduledJob` = recurring definition
- `Job` = one actual execution instance

This also makes it easy to pause or resume a recurring schedule without modifying already-created job instances.

---

# 5. Why delayed and one-time scheduled jobs still use the Job table

For delayed jobs and one-time scheduled jobs, I chose not to create a separate table. Instead, they are stored directly in `Job` with:

- `status = SCHEDULED`
- `availableAt = future timestamp`

The worker promotes them to `QUEUED` once `availableAt <= now`.

## Reason
These jobs are still one-time executions. They are not reusable recurring templates, so storing them directly in `Job` keeps the model simpler.

---

# 6. Queue-based execution model

Each project can own multiple queues, and each queue has its own configuration:

- pause / resume
- default priority
- concurrency limit
- retry policy
- optional rate-limit fields for future use

This queue-based model was chosen because it maps well to real background processing systems.

Example queues:
- `email-notifications`
- `report-generation`

It also allows different types of workloads to have different retry or concurrency behavior.

---

# 7. Worker polling model

The worker uses a polling model instead of database triggers or a message broker.

## Poll cycle
At each poll cycle, the worker:
1. recovers expired leases
2. promotes due one-time scheduled jobs
3. materializes recurring jobs from `ScheduledJob`
4. scans active queues
5. claims available jobs
6. executes them
7. updates execution history and final status

## Why polling was chosen
Polling was chosen because:
- it is simple to reason about
- it avoids requiring Kafka / RabbitMQ / Redis for the MVP
- it still demonstrates distributed job execution concepts
- it is easy to run locally during evaluation

Trade-off:
Polling is less efficient than broker-based or event-driven systems at larger scale.

---

# 8. Job claiming and duplicate execution prevention

One major requirement was to avoid multiple workers executing the same job.

## Current approach
The worker fetches eligible jobs and then attempts to claim each job using an update condition that only succeeds if the job is still in `QUEUED` state.

If the claim succeeds, the worker sets:
- `status = CLAIMED`
- `claimedByWorkerId`
- `claimedAt`
- `leaseExpiresAt`

## Why this helps
If two workers try to claim the same job, only one should successfully transition it from `QUEUED` to `CLAIMED`.

This gives a lightweight atomic-claim approach using the database as the coordination layer.

Trade-off:
At larger scale, I would consider raw SQL with row-level locking or `FOR UPDATE SKIP LOCKED`.

---

# 9. Lease expiry recovery

A worker may crash after claiming a job but before completing it. To prevent jobs from getting stuck forever, claimed jobs use leases.

When a worker claims a job, it sets a `leaseExpiresAt` timestamp. If the worker stops before completion and the lease expires, the system can return the job to `QUEUED`.

## Benefit
This makes the system fault-tolerant and prevents jobs from remaining permanently stuck in `CLAIMED` or `RUNNING`.

---

# 10. Retry policy design

Retry behavior is configured through the `RetryPolicy` table. Each queue can reference a retry policy.

Supported strategies:
- fixed delay
- linear backoff
- exponential backoff

When a job fails, the worker:
1. increments attempt count
2. checks the queue retry policy
3. computes the next retry time
4. either requeues the job or moves it to dead-letter

## Why retry policy is a separate table
Keeping retry policy separate avoids duplicating the same retry configuration across many queues and keeps the worker logic simpler.

---

# 11. Why dead-letter jobs are stored separately

When a job exhausts its retries, it moves to `DEAD_LETTER`. At that point, a row is also created in `DeadLetterJob`.

This table stores:
- failed job reference
- failure reason
- final attempt number
- optional failure summary

## Why not rely only on `Job.status = DEAD_LETTER`
Using a separate dead-letter table makes it easier to:
- display dead-letter entries in the dashboard
- store failure-specific metadata
- support future DLQ analytics or manual recovery flows

The `Job` row remains the primary job record, while `DeadLetterJob` acts as the DLQ record.

---

# 12. Job execution history

The `JobExecution` table stores execution attempts for a job.

Each execution records:
- worker id
- attempt number
- status
- start time
- finish time
- error message

## Why this table exists
Without execution history, only the final job state would be visible. Execution history makes it easier to:
- inspect retries
- debug failures
- measure execution duration
- see which worker processed the job

---

# 13. Batch jobs

Batch creation was added so the API can create multiple jobs in one request.

All jobs created in the same batch share the same `batchId`.

## Why this was useful
Batch creation helps:
- reduce repeated API calls
- group related jobs together
- track a logical set of jobs as one batch

It also covers one of the important assignment requirements beyond single-job creation.

---

# 14. Input validation with Zod

Zod was used for API request validation because it integrates cleanly with TypeScript and keeps validation explicit inside the route layer.

Validation is used for:
- login input
- single job creation
- batch job creation
- delayed / scheduled / recurring job inputs

This reduces invalid data reaching the database and provides cleaner error responses.

---

# 15. Frontend design approach

The frontend is intentionally lightweight and operational rather than heavily styled.

The dashboard focuses on:
- queue overview
- queue statistics
- job listing
- worker listing
- dead-letter listing
- actions such as pause/resume and requeue
- quick job creation actions for demo/testing

## Reason
The assignment prioritizes system design, backend engineering, concurrency handling, and reliability more than UI polish. The frontend was designed to make the backend visible and usable rather than to act as a polished production admin panel.

---

# 16. Testing scope

Automated tests were added for critical backend functionality:

1. **Batch job creation**
   - verifies multiple jobs can be created under the same `batchId`

2. **Dead-letter persistence**
   - verifies failed jobs can exist in dead-letter state with matching dead-letter metadata

3. **Recurring scheduled job definition creation**
   - verifies recurring schedule definitions are stored correctly
   batch job creation
scheduled recurring jobs
dead-letter handling
retry / requeue flow

## Trade-off
These are integration-style database tests rather than full end-to-end API tests. For this MVP, I prioritized testing critical persistence and lifecycle behavior first.

---





---

# 17. Final summary

The main design direction of this project was to keep the system simple enough to build during an internship assignment while still implementing the most important concepts behind a distributed job scheduler:

- persistent queues
- asynchronous workers
- retries and dead-letter handling
- delayed and recurring scheduling
- execution history
- worker heartbeats
- queue-level controls
- dashboard visibility

The result is not a full production scheduler yet, but it is structured in a way that can be extended further.
