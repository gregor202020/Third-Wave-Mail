---
phase: 04-data-integrity-error-handling
plan: 02
subsystem: workers
tags: [bullmq, redis, lua, error-handling, campaign, bulk-send]

# Dependency graph
requires:
  - phase: 04-data-integrity-error-handling
    provides: research context on bulk-send counter integrity issue (DATA-07)
provides:
  - try/finally counter protection in bulk-send worker ensuring Redis decrement on any error
  - enriched worker.on('failed') logging with campaignId and contactId context
affects:
  - campaign completion reliability
  - Redis counter accuracy under error conditions

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "shouldDecrementOnError flag pattern: set true at point-of-no-return, false after success-path decrement, finally block checks flag"
    - "Nested try/catch inside finally to log errors without masking the original exception"

key-files:
  created: []
  modified:
    - packages/workers/src/workers/bulk-send.worker.ts

key-decisions:
  - "shouldDecrementOnError set immediately after executeTakeFirstOrThrow — message record creation is the point of no return"
  - "Finally block only does basic status transition (SENDING -> SENT), not the full resend-trigger path — acceptable to skip on error completion"
  - "Finally errors are caught and logged but never swallowed — original exception propagates normally"
  - "total_sent only increments after confirmed SES send (unchanged) — DATA-07 does not require failure counting"

patterns-established:
  - "Point-of-no-return flag: declare shouldDecrementOnError = true immediately after creating a side-effect that must be cleaned up"
  - "Finally guard: set flag = false after success-path cleanup to prevent double-execution"

requirements-completed:
  - DATA-07

# Metrics
duration: 2min
completed: 2026-03-12
---

# Phase 4 Plan 02: Bulk-Send Worker Counter Integrity Summary

**try/finally guard with shouldDecrementOnError flag ensures Redis remaining counter always decrements after message record creation, preventing campaigns from sticking in SENDING on error**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-12T23:38:27Z
- **Completed:** 2026-03-12T23:40:34Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments
- Added `shouldDecrementOnError` flag set to `true` at point-of-no-return (after message record creation)
- Wrapped merge-tag processing through completion-check logic in try/finally block
- Flag set to `false` after success-path Lua decrement to prevent double-decrement
- Finally block decrements Redis counter and transitions campaign to SENT if this was the last job
- Updated `worker.on('failed')` to log `campaignId` and `contactId` alongside job ID

## Task Commits

Each task was committed atomically:

1. **Task 1: Add try/finally counter protection to bulk-send job processor** - `280dc90` (feat)

**Plan metadata:** (docs commit — see below)

## Files Created/Modified
- `packages/workers/src/workers/bulk-send.worker.ts` - try/finally counter protection + enriched failure logging

## Decisions Made
- `shouldDecrementOnError` flag declared immediately after `executeTakeFirstOrThrow()` — this is the semantic "point of no return" where a message record exists in the DB and the counter MUST be decremented
- The finally block performs only the basic `SENDING -> SENT` transition, not the resend-to-non-openers trigger — the resend trigger is optional and acceptable to skip on the error completion path
- Pre-existing TypeScript error at line 389 (`campaign_holdback_contacts` table not in schema types) left in place — it is in the untouched `createCampaignSendWorker` function, pre-dates this plan, and is out of scope

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- Pre-existing TypeScript compile error for `campaign_holdback_contacts` table in `createCampaignSendWorker` function (line 389) — not caused by this plan's changes, deferred to `deferred-items.md`

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- DATA-07 counter integrity fix is complete
- Campaigns can now transition to SENT even when individual bulk-send jobs fail
- Pre-existing `campaign_holdback_contacts` TypeScript schema gap should be addressed in a future plan

## Self-Check: PASSED

- `packages/workers/src/workers/bulk-send.worker.ts` — FOUND
- `.planning/phases/04-data-integrity-error-handling/04-02-SUMMARY.md` — FOUND
- Commit `280dc90` — FOUND

---
*Phase: 04-data-integrity-error-handling*
*Completed: 2026-03-12*
