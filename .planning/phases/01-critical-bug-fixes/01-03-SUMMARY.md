---
phase: 01-critical-bug-fixes
plan: 03
status: complete
---

# Plan 01-03 Summary: Scheduled Campaign Trigger

## Changes Made

### packages/workers/src/scheduler.ts (NEW)
- **BUG-05**: Created polling loop that runs every 60 seconds
- Finds campaigns with `status=SCHEDULED` and `scheduled_at <= NOW()`
- Transitions to SENDING with race-safe WHERE guard (PostgreSQL row-level locking)
- Enqueues campaign-send job via BullMQ

### packages/workers/src/index.ts
- Integrated scheduler into `bulk` worker type startup
- Added cleanup (clearInterval + queue.close) to shutdown handler

## Verification
- No cron libraries — uses native `setInterval`
- Race-safe: UPDATE WHERE status=SCHEDULED ensures only one replica triggers per campaign
- Scheduler cleaned up on SIGTERM/SIGINT
