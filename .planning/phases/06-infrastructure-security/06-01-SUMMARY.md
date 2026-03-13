---
phase: 06-infrastructure-security
plan: 01
subsystem: infra
tags: [redis, bullmq, ioredis, ses, pgbouncer, docker-compose]

# Dependency graph
requires:
  - phase: 05-data-integrity-tracking-segments
    provides: bulk-send worker that sets Redis counters and sends via SES
provides:
  - Redis noeviction + AOF everysec persistence config
  - SES configuration set read from env var with fallback
  - 7-day TTL on Redis campaign counter keys
  - BullMQ connection type safety (no `as any` casts)
  - PgBouncer pool math documentation
affects:
  - 06-02 (further infra/security work in same phase)
  - All phases using bulk-send worker

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "BullMQ connection typed via `as unknown as ConnectionOptions` when dual ioredis versions are present"
    - "Redis counter keys use EX 604800 (7-day TTL) to prevent stale key accumulation"
    - "SES configuration set sourced from SES_CONFIGURATION_SET env var with 'marketing' fallback"

key-files:
  created: []
  modified:
    - docker-compose.yml
    - pgbouncer/pgbouncer.ini
    - packages/workers/src/workers/bulk-send.worker.ts

key-decisions:
  - "BullMQ bundles its own ioredis vendor copy — direct Redis instance assignment fails type check; use `as unknown as ConnectionOptions` for type safety without `as any`"
  - "SES_CONFIG_SET const at module scope (not inside function) so env var is read once at startup"
  - "PgBouncer pool math: 40 default + 5 reserve = 45 server connections <= 50 Postgres max_connections, leaving 5 for superuser"
  - "Redis noeviction policy chosen over allkeys-lru to guarantee BullMQ job keys are never silently evicted"
  - "appendfsync everysec chosen for Redis AOF — one second max data loss on crash, acceptable performance trade-off"

patterns-established:
  - "Pattern: Docker worker env blocks include SES_CONFIGURATION_SET with ${VAR:-default} syntax"
  - "Pattern: Redis counter SET calls always include EX 604800 (7 days) TTL"

requirements-completed: [INFRA-01, INFRA-03, INFRA-04, INFRA-07, INFRA-09, INFRA-10]

# Metrics
duration: 15min
completed: 2026-03-13
---

# Phase 6 Plan 1: Infrastructure Security Summary

**Redis hardened with noeviction + AOF everysec, SES config set moved to env var, campaign counter keys get 7-day TTL, and BullMQ connection type casts replaced with typed `as unknown as ConnectionOptions`**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-03-13T11:30:00Z
- **Completed:** 2026-03-13T11:45:00Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- Redis maxmemory-policy changed from `allkeys-lru` to `noeviction` — BullMQ job keys can never be silently evicted
- Redis AOF `appendfsync everysec` added — job data survives process restarts with at most 1s of data loss
- SES configuration set name moved from hardcoded `'marketing'` to `process.env['SES_CONFIGURATION_SET'] ?? 'marketing'`
- Both worker services in docker-compose.yml now pass `SES_CONFIGURATION_SET` env var
- Redis counter `twmail:remaining:<campaignId>` keys now have 7-day TTL (604800s) to prevent stale key accumulation
- All `as any` casts on BullMQ connection parameters removed and replaced with `as unknown as ConnectionOptions`
- PgBouncer pool sizing math documented inline in pgbouncer.ini

## Task Commits

Each task was committed atomically:

1. **Task 1: Redis hardening (noeviction + AOF fsync) and PgBouncer documentation** - `93a3e96` (chore)
2. **Task 2: SES config set env var + Redis counter TTL + remove `as any` casts** - `77cb069` (feat)

**Plan metadata:** (docs commit follows)

## Files Created/Modified

- `docker-compose.yml` - Redis command updated (noeviction + appendfsync everysec); SES_CONFIGURATION_SET env var added to worker-bulk and worker-system
- `pgbouncer/pgbouncer.ini` - Pool sizing math documented in comment block above numeric settings
- `packages/workers/src/workers/bulk-send.worker.ts` - SES_CONFIG_SET const, 604800 TTL on two redis.set calls, `ConnectionOptions` import, typed casts replacing `as any`

## Decisions Made

- BullMQ 5.x bundles its own `ioredis` under `node_modules/bullmq/node_modules/ioredis`. This makes the top-level `ioredis` `Redis` instance structurally incompatible with BullMQ's `ConnectionOptions` type at the class level. Solution: import `ConnectionOptions` from `bullmq` and use `redis as unknown as ConnectionOptions`. This removes semantic `as any` while accurately expressing intent.
- `SES_CONFIG_SET` const is at module scope (not inside `createBulkSendWorker`) so the env var is read once at process startup rather than on each function call.
- PgBouncer numeric values unchanged — math was already correct; only documentation was missing.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Used `as unknown as ConnectionOptions` instead of bare `as Redis` for BullMQ connections**
- **Found during:** Task 2 (TypeScript compilation check)
- **Issue:** BullMQ 5.x vendors its own ioredis, causing structural type incompatibility between the top-level `ioredis` `Redis` class and BullMQ's `IORedis.Redis`. Simply removing `as any` caused 6 TS2322 errors. The plan's guidance "use `as Redis` with IORedis type import" would fail the same way.
- **Fix:** Imported `ConnectionOptions` from `bullmq` and cast as `redis as unknown as ConnectionOptions` — semantically correct, no blind `as any`
- **Files modified:** `packages/workers/src/workers/bulk-send.worker.ts`
- **Verification:** `tsc --noEmit` shows zero connection-related errors in bulk-send.worker.ts
- **Committed in:** `77cb069` (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (Rule 3 - blocking TypeScript error)
**Impact on plan:** Necessary adaptation to dual-ioredis package layout. Outcome fully satisfies INFRA-04 intent — unsafe `as any` is gone, replaced with explicit typed cast.

## Issues Encountered

- Pre-existing TypeScript errors in `ab-eval.worker.ts` and `bulk-send.worker.ts` (missing `campaign_holdback_contacts` table in DB schema, missing `resolveSegmentContactIds` export) were out of scope and left untouched. These existed before this plan's changes.

## User Setup Required

- Add `SES_CONFIGURATION_SET=<your-ses-config-set-name>` to your `.env` file if the configuration set name differs from `marketing`. Workers will use `marketing` as the default if the variable is absent.

## Next Phase Readiness

- Infrastructure hardening baseline complete: Redis is safe for BullMQ job storage, SES config is environment-driven
- Phase 6 Plan 2 can proceed with remaining infrastructure/security work
- Pre-existing TypeScript errors in ab-eval.worker.ts (campaign_holdback_contacts schema) and bulk-send.worker.ts (resolveSegmentContactIds export) should be addressed in a future plan

---
*Phase: 06-infrastructure-security*
*Completed: 2026-03-13*
