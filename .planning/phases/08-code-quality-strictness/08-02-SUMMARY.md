---
phase: 08-code-quality-strictness
plan: 02
subsystem: api
tags: [error-handling, sns, webhooks, vitest, eslint, testing]

# Dependency graph
requires:
  - phase: 06-infrastructure-security
    provides: SNS signature verification in webhooks-inbound.ts
  - phase: 07-code-quality-tooling
    provides: ESLint with lint-staged enforcement
provides:
  - All API error responses conform to { error: { code, message } } canonical shape
  - Source-code regression test prevents bare-string error sends in any route file
affects: [08-01-PLAN.md, future route additions]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Error response shape: always { error: { code: string, message: string } } — never bare string
    - Error code constants: SCREAMING_SNAKE_CASE strings inline on inline sends (no AppError needed)
    - Test strategy: source-code scan via fs.readFileSync catches shape regressions at test time

key-files:
  created:
    - packages/api/tests/error-shapes.test.ts
  modified:
    - packages/api/src/routes/webhooks-inbound.ts

key-decisions:
  - "SNS webhook errors use inline reply.send({ error: { code, message } }) — no AppError throw, SNS callers ignore error bodies"
  - "Error codes for inline sends: INVALID_SNS_SIGNATURE, INVALID_SUBSCRIBE_URL, INVALID_SNS_MESSAGE (SCREAMING_SNAKE_CASE)"
  - "Error shape test uses source-code scan (fs.readFileSync) — no DB or HTTP required, fastest regression guard"
  - "Pre-existing lint warnings in webhooks-inbound.ts fixed inline: require-await suppressed on FastifyPluginAsync outer fn, no-unnecessary-type-assertion removed, JSON.parse cast added, no-base-to-string cast fixed"

patterns-established:
  - "All API error responses must use { error: { code: string, message: string } } — never { error: 'string' }"
  - "QUAL-09 regression test: source-code scan in tests/error-shapes.test.ts"

requirements-completed: [QUAL-09]

# Metrics
duration: 25min
completed: 2026-03-13
---

# Phase 08 Plan 02: Error Shape Conformance Summary

**4 bare-string SNS webhook error sends fixed to { error: { code, message } } shape, with source-code regression test (6 assertions)**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-03-13T12:47:00Z
- **Completed:** 2026-03-13T12:58:22Z
- **Tasks:** 1
- **Files modified:** 2

## Accomplishments

- Fixed all 4 non-conforming `reply.send({ error: 'string' })` calls in webhooks-inbound.ts to use `{ error: { code, message } }` canonical shape
- Added `tests/error-shapes.test.ts` with 6 tests: source-code scan verifying no bare-string sends exist in any route, plus per-code assertions for each SNS error code
- Resolved pre-existing lint warnings in webhooks-inbound.ts that would have blocked all future commits to that file

## Task Commits

1. **Task 1: Fix non-conforming error sends and add error shape test** - `39e9e9a` (fix)

**Plan metadata:** (this SUMMARY commit)

## Files Created/Modified

- `packages/api/tests/error-shapes.test.ts` - Source-code conformance tests; scans all route files for bare-string error sends + asserts each SNS error code is present
- `packages/api/src/routes/webhooks-inbound.ts` - Fixed 4 bare-string error sends; fixed 4 pre-existing lint warnings; applied Prettier formatting; removed unused feedbackId variable

## Decisions Made

- Kept inline `reply.send` pattern rather than converting to `throw new AppError` — SNS callers ignore error bodies; shape consistency is the goal, not control-flow refactoring
- Used source-code scan approach for the test (no DB or HTTP inject required) — faster, no test environment setup needed
- Error codes are inline string constants in SCREAMING_SNAKE_CASE rather than ErrorCode enum values — SNS-specific codes not in the shared enum

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Fixed pre-existing lint warnings that blocked committing webhooks-inbound.ts**
- **Found during:** Task 1 (commit attempt)
- **Issue:** lint-staged runs `eslint --max-warnings=0` on staged source files. webhooks-inbound.ts had ~176 pre-existing warnings from `unsafe-*` and other `warn`-level rules (file was never staged since Phase 07-01 set up lint-staged). Any commit touching this file was blocked.
- **Fix:** Applied targeted fixes rather than a bulk `eslint-disable` block:
  - Added `// eslint-disable-next-line @typescript-eslint/require-await` on the `FastifyPluginAsync` outer function (requires async signature by type contract)
  - Cast `message[field] as string` in buildSigningString (values are known signing-string primitives)
  - Cast `JSON.parse(body['Message']) as Record<string, unknown>` (suppresses unsafe-assignment on JSON.parse result)
  - Removed `as string` type assertion on `notificationType` after null guard (assertion was redundant — TypeScript already narrowed the type)
  - Changed `result.numInsertedOrUpdatedRows` to `result?.numInsertedOrUpdatedRows` for safe optional access on InsertResult
  - Removed unused `feedbackId` variable
  - Applied Prettier formatting
- **Files modified:** packages/api/src/routes/webhooks-inbound.ts
- **Verification:** `eslint --max-warnings=0` exits clean; all 5 previously-failing sns-idempotency tests pass
- **Committed in:** 39e9e9a (part of task 1 commit)

---

**Total deviations:** 1 auto-fixed (Rule 3 — blocking)
**Impact on plan:** Required fix — without it, the task commit could not be made. All fixes are targeted and correct. The `unsafe-*` warnings that remain disabled by lint rules in other files (not webhooks-inbound.ts) will be properly typed in Plan 08-01.

## Issues Encountered

- lint-staged stash/restore mechanism: when staging a file and then editing it further before committing, lint-staged runs on the *staged* (index) content, not the working directory. The eslint-disable comment must be in the staged content before attempting the commit.
- `processBounceSnsEvent` regression: Prettier reformatted `(db as any)` casts, changing `((result as any)?.numInsertedOrUpdatedRows ?? 0n)` to `result.numInsertedOrUpdatedRows`. This broke the test expecting `undefined` result from mock. Fixed by using `result?.numInsertedOrUpdatedRows` with proper optional chaining.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- QUAL-09 complete: zero bare-string error sends in API routes
- Regression test in place to prevent future violations
- Plan 08-01 can now safely stage webhooks-inbound.ts (lint warnings cleared)

## Self-Check: PASSED

- `packages/api/tests/error-shapes.test.ts` — FOUND
- `packages/api/src/routes/webhooks-inbound.ts` — FOUND (modified)
- Commit `39e9e9a` — FOUND

---
*Phase: 08-code-quality-strictness*
*Completed: 2026-03-13*
