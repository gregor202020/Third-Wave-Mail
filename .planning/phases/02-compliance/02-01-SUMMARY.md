---
phase: 02-compliance
plan: "01"
subsystem: compliance
tags: [compliance, can-spam, idempotency, sns, migration]
dependency_graph:
  requires: []
  provides: [dedup-unique-index, physical-address-enforcement, physical-address-settings-api]
  affects: [events-table, settings-table, webhooks-inbound, campaigns-send, settings-api]
tech_stack:
  added: []
  patterns: [on-conflict-do-nothing, guard-side-effects-on-insert-result]
key_files:
  created:
    - db/migrations/005_compliance.sql
  modified:
    - packages/shared/src/schema.ts
    - packages/api/src/routes/webhooks-inbound.ts
    - packages/api/src/services/campaigns.service.ts
    - packages/api/src/routes/settings.ts
decisions:
  - "Used NOT NULL DEFAULT '' for physical_address — empty string means 'not configured', avoids nullable column"
  - "Partial index covers event_type IN (5,6,7) including soft bounces (6) — a single delivery cannot soft-bounce twice"
  - "Guard side effects (counter increments) on numInsertedOrUpdatedRows === 0n to prevent double-counting on duplicate SNS delivery"
metrics:
  duration_seconds: 173
  completed_date: "2026-03-12T22:52:25Z"
  tasks_completed: 2
  files_changed: 5
---

# Phase 2 Plan 01: SNS Idempotency and Physical Address Enforcement Summary

SNS bounce/complaint dedup via partial unique index and ON CONFLICT DO NOTHING, plus CAN-SPAM physical address requirement enforced at send time with settings API support.

## What Was Built

### Task 1: Compliance Migration and Schema Update

Created `db/migrations/005_compliance.sql` with two changes:
- `ALTER TABLE settings ADD COLUMN physical_address TEXT NOT NULL DEFAULT ''` — empty string default, application treats empty as "not configured"
- `CREATE UNIQUE INDEX idx_events_dedup_bounce_complaint ON events (message_id, event_type) WHERE event_type IN (5, 6, 7) AND message_id IS NOT NULL` — partial unique index covering hard bounce (5), soft bounce (6), and complaint (7) event types

Updated `packages/shared/src/schema.ts` to add `physical_address: Generated<string>` to `SettingsTable`.

### Task 2: SNS Idempotency and Physical Address Validation

**SNS idempotency** (`packages/api/src/routes/webhooks-inbound.ts`):
- Bounce case: converted parallel `Promise.all()` with event insert to sequential — insert first with `.onConflict((oc: any) => oc.columns(['message_id', 'event_type']).doNothing())`, then guard side effects on `numInsertedOrUpdatedRows === 0n`
- Complaint case: same pattern — idempotent insert followed by guarded side effects

**Physical address enforcement** (`packages/api/src/services/campaigns.service.ts`):
- Added check in `sendCampaign()` after existing validations: reads `settings.physical_address` and throws 400 `VALIDATION_ERROR` if empty or whitespace

**Settings API** (`packages/api/src/routes/settings.ts`):
- Added `physical_address: z.string().max(500).optional()` to `updateSchema`
- GET already returns `selectAll()` which includes the new column

## Verification

1. Migration file contains both ALTER TABLE and CREATE UNIQUE INDEX: confirmed
2. SettingsTable includes `physical_address: Generated<string>`: confirmed
3. webhooks-inbound.ts has 2 `onConflict` calls and 2 `numInsertedOrUpdatedRows` guards: confirmed
4. campaigns.service.ts checks `physical_address` before setting status to SENDING: confirmed
5. settings.ts updateSchema includes `physical_address` validation: confirmed
6. No new dependencies added: confirmed

## Commits

| Task | Description | Hash |
|------|-------------|------|
| 1 | Compliance migration and schema update | abd9749 |
| 2 | SNS idempotency and physical address enforcement | 0f63bc1 |

## Self-Check: PASSED

All files exist, all commits found.

## Decisions Made

1. **NOT NULL DEFAULT ''**: Physical address stored as empty string rather than NULL. Application logic (`!settings?.physical_address?.trim()`) treats empty string as "not configured". This avoids nullable column complications in Kysely types.

2. **Soft bounce included in unique index**: event_type 6 (soft bounce) is included alongside hard bounce (5) and complaint (7). A single message delivery cannot produce two soft bounce notifications for the same message, so dedup is correct.

3. **Sequential insert + guard pattern**: Changed from `Promise.all()` to sequential execution for bounce/complaint cases. The insert result (`numInsertedOrUpdatedRows`) is checked before running side effects. This prevents counter drift when SNS delivers the same notification twice.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] TypeScript implicit any on onConflict callback**
- **Found during:** Task 2 verification (tsc --noEmit)
- **Issue:** `(oc) =>` callback inferred as `any` causing TS7006 error under strict mode
- **Fix:** Added explicit `(oc: any)` type annotation on both onConflict callbacks
- **Files modified:** packages/api/src/routes/webhooks-inbound.ts
- **Commit:** 0f63bc1

### Out-of-Scope Pre-existing Issues

The following pre-existing error was found but not fixed (Rule scope boundary):
- `src/services/campaigns.service.ts:189` — Redis/ioredis version mismatch between ioredis and bullmq's bundled ioredis. This error existed before any changes in this plan. Logged for deferred handling.
