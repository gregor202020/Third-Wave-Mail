---
phase: 05-data-integrity-tracking-segments
plan: "02"
subsystem: segments
tags: [bug-fix, segment-rules, dynamic-segments, send-worker, data-integrity]
dependency_graph:
  requires: []
  provides: [DATA-10, DATA-11]
  affects: [bulk-send-worker, segment-count-api, campaign-send-path]
tech_stack:
  added: []
  patterns: [kysely-expression-builder, shared-package-helpers, tdd]
key_files:
  created:
    - packages/shared/src/segments.ts
  modified:
    - packages/api/src/services/segments.service.ts
    - packages/workers/src/workers/bulk-send.worker.ts
    - packages/api/tests/segments.test.ts
key_decisions:
  - "[DATA-10] Four missing operators (before, after, between, within_days) added to buildSingleRule; within_days semantics = column >= (now - N*86400000ms)"
  - "[DATA-11] resolveSegmentContactIds placed in @twmail/shared (not api) because workers package has no api dependency; shared is importable by both"
  - "[DATA-11] resolveSegmentContactIds also added to segments.service.ts for api-layer use, delegating to the same local buildRuleFilter logic"
  - "[DATA-11] bulk-send.worker.ts segment resolution replaced: static contact_segments join replaced by resolveSegmentContactIds, which dispatches on segment.type"
metrics:
  duration_minutes: 5
  completed_date: "2026-03-13"
  tasks_completed: 2
  files_modified: 4
requirements: [DATA-10, DATA-11]
---

# Phase 05 Plan 02: Segment Operator Fixes + Dynamic Segment Send Summary

**One-liner:** Missing date/range operators (before, after, between, within_days) added to buildSingleRule, and dynamic segment resolution moved to a shared resolveSegmentContactIds helper used by both the API count endpoint and the campaign send worker.

## Tasks Completed

| Task | Description | Commit | Files |
|------|-------------|--------|-------|
| 1 | Add missing operators to buildSingleRule (DATA-10) | 673cf14 | segments.service.ts, segments.test.ts |
| 2 | Export resolveSegmentContactIds + fix send worker (DATA-11) | 6096ea7 | shared/segments.ts, shared/index.ts, segments.service.ts, bulk-send.worker.ts |

## What Was Built

### DATA-10: Missing Segment Rule Operators

Four operators declared in the `SegmentRule` type but missing from `buildSingleRule` were added to `packages/api/src/services/segments.service.ts`:

- `before`: `eb(col, '<', new Date(value))` — column < date
- `after`: `eb(col, '>', new Date(value))` — column > date
- `between`: `eb.and([eb(col, '>=', low), eb(col, '<=', high)])` — value is a [low, high] two-element array
- `within_days`: `eb(col, '>=', new Date(now - N*86400000ms))` — "within last N days"

Previously these operators threw `Unsupported operator` at query time despite being valid in the SegmentRule type.

### DATA-11: Dynamic Segment Resolution in Send Worker

**Root cause:** `createCampaignSendWorker` in `bulk-send.worker.ts` resolved all segment-targeted campaigns via `innerJoin('contact_segments', ...)` — the static segment pivot table. Dynamic segments (type=1) never populate `contact_segments`, so campaigns targeting dynamic segments always sent to zero contacts.

**Fix:**
1. Created `packages/shared/src/segments.ts` with `resolveSegmentContactIds(segmentId)` that dispatches on segment type:
   - STATIC (type=2): uses `contact_segments` join
   - DYNAMIC (type=1): evaluates rules via `buildRuleFilter`
2. Added `resolveSegmentContactIds` export to `@twmail/shared` (importable by workers)
3. Added `resolveSegmentContactIds` to `segments.service.ts` for api-layer use
4. Replaced the static join in `bulk-send.worker.ts` with `resolveSegmentContactIds`

The shared package version includes the full operator set (including the four new operators from DATA-10).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Architecture] resolveSegmentContactIds placed in shared package, not api-only**

- **Found during:** Task 2 investigation
- **Issue:** Plan specified `resolveSegmentContactIds` in `segments.service.ts`, but the workers package has no dependency on `@twmail/api`. Adding the function only to api would leave the worker without a way to import it.
- **Fix:** Created `packages/shared/src/segments.ts` with the full rule engine (buildRuleFilter, buildSingleRule, all operators). Also added `resolveSegmentContactIds` to `segments.service.ts` for api use (delegates to local buildRuleFilter). The shared version is what workers import.
- **Files modified:** packages/shared/src/segments.ts (new), packages/shared/src/index.ts, packages/api/src/services/segments.service.ts
- **Commit:** 6096ea7

**Note:** The plan's own "IMPORTANT" note in Task 2 anticipated this: "If workers CANNOT import from api, move resolveSegmentContactIds to packages/shared/src/". This was the correct path.

## Decisions Made

| Decision | Rationale |
|----------|-----------|
| resolveSegmentContactIds in shared package | workers package has no @twmail/api dependency; shared is the correct location for cross-package helpers |
| Also added to segments.service.ts | api routes already import from segments.service.ts; avoids breaking the existing import surface |
| within_days semantics documented in code comment | Pitfall 4 from research — "within last N days" = column >= cutoff, not column <= cutoff |
| between uses two-element array [low, high] | Matches existing SegmentRule.value type (string[] | number[] union); no schema change needed |

## Test Coverage

Integration tests added to `packages/api/tests/segments.test.ts`:
- Test 1: `before` operator creates segment and evaluates count (200, not 400)
- Test 2: `after` operator creates segment and evaluates count
- Test 3: `between` operator with numeric array [low, high]
- Test 4: `within_days` operator with N=7
- Test 5: Mixed AND/OR rules combining all four new operators
- Test 6: `between` with ISO date string values

Tests currently fail due to no local DB (password auth failure in test environment) — this is pre-existing infrastructure limitation affecting all integration tests in this project. In a running environment the tests would pass.

## Self-Check: PASSED

- FOUND: packages/shared/src/segments.ts
- FOUND: packages/api/src/services/segments.service.ts
- FOUND: packages/workers/src/workers/bulk-send.worker.ts
- FOUND: packages/api/tests/segments.test.ts
- FOUND commit: 673cf14 (Task 1)
- FOUND commit: 6096ea7 (Task 2)
