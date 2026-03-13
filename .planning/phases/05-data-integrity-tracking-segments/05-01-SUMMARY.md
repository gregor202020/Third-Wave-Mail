---
phase: 05-data-integrity-tracking-segments
plan: 01
subsystem: api
tags: [tracking, click-redirect, url-preservation, kysely, vitest, tdd]

# Dependency graph
requires:
  - phase: 04-data-integrity-error-handling
    provides: tracking route error handling patterns (fire-and-forget + request.log.error)
provides:
  - resolveClickUrl exported helper: pure URL resolution from SENT event link_map
  - click redirect handler querying SENT event link_map only (EventType.SENT)
  - 14 unit tests covering URL resolution, UTM params, encoded chars, fallback, protocol validation
affects:
  - 05-02-PLAN (segments service)
  - any future work touching click tracking redirect path

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Extract redirect URL resolution into exported pure function for direct unit testing without DB mocks"
    - "Return raw URL string from link_map verbatim (not url.href) to avoid double-encoding percent chars"
    - "SENT event link_map is canonical URL source — CLICK event is write-only audit trail"

key-files:
  created: []
  modified:
    - packages/api/src/routes/tracking.ts
    - packages/api/tests/tracking.test.ts

key-decisions:
  - "resolveClickUrl extracted as exported pure function — takes raw metadata object, returns URL string; testable without DB mocks or app.inject()"
  - "CLICK event query removed entirely from redirect handler — SENT event link_map is the sole URL source"
  - "targetUrl passed directly to reply.redirect() as raw string — not reconstructed via new URL().href to prevent double-encoding of percent chars"
  - "recordClick (audit INSERT) left unchanged — EventType.CLICK in INSERT is correct, only the LOOKUP query was wrong"
  - "Full test suite failures (auth/contacts/lists/api-keys/segments) are pre-existing DB connection issues (no local PostgreSQL); not caused by this change"

patterns-established:
  - "Pattern: Export pure helper functions from route files to enable unit testing without DB/app setup"

requirements-completed: [DATA-08, DATA-09]

# Metrics
duration: 15min
completed: 2026-03-13
---

# Phase 5 Plan 01: Fix Click Redirect URL Resolution Summary

**Click tracking redirect rewritten to query SENT event link_map exclusively, with resolveClickUrl pure helper that preserves URLs verbatim through UTM params and percent-encoded characters**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-03-13T11:04:00Z
- **Completed:** 2026-03-13T11:20:00Z
- **Tasks:** 1 (TDD: test + feat commits)
- **Files modified:** 2

## Accomplishments

- Removed the CLICK event JSONB metadata query from the click redirect handler — eliminated a slow full table scan on a partitioned table that was also querying the wrong source of truth
- SENT event link_map is now the sole URL resolution path — uses the `idx_events_message` index cleanly (message_id + event_type=1, no JSONB filter)
- Extracted `resolveClickUrl` as an exported pure function accepting raw metadata and returning the validated URL string — 14 unit tests covering all six behavior categories run without a database
- URL preservation confirmed: raw string returned directly without URL reconstruction, preventing double-encoding of percent chars in UTM params and encoded query strings

## Task Commits

Each task was committed atomically (TDD pattern: test then feat):

1. **RED — Failing tests for resolveClickUrl** - `f04cda1` (test)
2. **GREEN — Fix tracking.ts: SENT event link_map + export resolveClickUrl** - `2c3d11b` (feat)

**Plan metadata:** (docs commit follows)

_Note: TDD task split into two commits (test RED → feat GREEN) per TDD execution protocol_

## Files Created/Modified

- `packages/api/src/routes/tracking.ts` - Removed CLICK event query from redirect handler; added SENT event lookup; exported `resolveClickUrl` pure helper with protocol validation
- `packages/api/tests/tracking.test.ts` - Added 14 tests for resolveClickUrl (UTM params, encoded chars, null metadata, missing linkHash, javascript:/data: protocol blocking)

## Decisions Made

- **resolveClickUrl is a pure function** — accepts `unknown` metadata (matching Kysely's return type) and returns a validated URL string. No DB access, no Fastify deps. Directly unit testable.
- **CLICK event query removed entirely** — the research confirmed CLICK events don't exist on first click anyway (always fell through to SENT lookup). Removing it simplifies the code and aligns with the correct data model.
- **Raw string redirect** — `reply.redirect(targetUrl)` uses the raw string from link_map, not `new URL(targetUrl).href`. This avoids `%20` becoming `%2520` (double-encoding).
- **recordClick unchanged** — the `EventType.CLICK` INSERT in `recordClick` is correct and intentional audit trail. Only the URL lookup query was removed.

## Deviations from Plan

None — plan executed exactly as written. The TDD approach (extract pure helper, test via direct function call rather than `app.inject()`) was explicitly anticipated by the plan's action item 3.

## Issues Encountered

None.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- Click redirect fix complete — DATA-08 and DATA-09 resolved
- Phase 5 Plan 02 ready: segments service fixes (DATA-10: missing date operators, DATA-11: dynamic segment send resolution)
- No blockers

---

## Self-Check: PASSED

Files verified:
- FOUND: packages/api/src/routes/tracking.ts
- FOUND: packages/api/tests/tracking.test.ts
- FOUND: .planning/phases/05-data-integrity-tracking-segments/05-01-SUMMARY.md

Commits verified:
- f04cda1 — test(05-01): add failing tests for resolveClickUrl URL resolution
- 2c3d11b — feat(05-01): fix click redirect to use SENT event link_map (DATA-08, DATA-09)

Test run verified:
- 21/21 tests pass in tests/tracking.test.ts (including 14 new resolveClickUrl tests + 7 existing detectMachineOpen tests)

---
*Phase: 05-data-integrity-tracking-segments*
*Completed: 2026-03-13*
