# Relay MVP Hardening Patch

Apply these files on top of `relay-working-mvp-submission.zip`.

This patch hardens the MVP into a more credible internship submission by adding:

## Backend hardening
- safer seed script with upsert-based demo data
- 2 queues with mixed seeded jobs
- worker graceful shutdown
- concurrent job execution with `Promise.all`
- documented atomic claim flow using `FOR UPDATE SKIP LOCKED`
- queue pause / resume endpoints
- job retry endpoint
- dead-letter requeue endpoint
- job executions endpoint

## Frontend hardening
- queue summary cards
- jobs table
- workers table
- dead-letter table with requeue action

## Docs hardening
- README rewritten to only claim implemented MVP features
- explicit tradeoff section
- explicit deferred features section
