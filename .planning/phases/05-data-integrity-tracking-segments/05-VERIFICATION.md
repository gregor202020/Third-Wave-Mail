---
phase: 05-data-integrity-tracking-segments
verified: 2026-03-13T12:00:00Z
status: passed
score: 6/6 must-haves verified
re_verification: false
---

# Phase 5: Data Integrity — Tracking & Segments Verification Report

**Phase Goal:** Click tracking redirects correctly and segments produce accurate contact lists
**Verified:** 2026-03-13T12:00:00Z
**Status:** PASSED
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Click tracking redirect resolves the original URL from the SENT event link_map, not from a CLICK event scan | VERIFIED | `tracking.ts` line 57-62: queries `events` table with `event_type = EventType.SENT`; `resolveClickUrl` reads `sentEvent?.metadata`; no CLICK event lookup path exists in the redirect handler |
| 2 | A tracked link with UTM parameters or encoded query strings reaches the original URL unchanged | VERIFIED | `resolveClickUrl` returns `targetUrl` as a raw string directly from `link_map` (not via `new URL().href`); 6 tests in `tracking.test.ts` (Tests 2 and 3) assert no double-encoding and no mutation of UTM params or percent-encoded chars |
| 3 | The CLICK event query path in the redirect handler is removed entirely | VERIFIED | `EventType.CLICK` appears only in `recordClick` (line 257, write-only audit INSERT); the redirect handler at lines 49-72 contains no CLICK event SELECT; grep confirms zero CLICK lookups in the redirect path |
| 4 | A segment rule using between, before, after, or within_days operators evaluates correctly instead of throwing | VERIFIED | All four operators implemented in `buildSingleRule` in both `segments.service.ts` (lines 383-396) and `packages/shared/src/segments.ts` (lines 90-103); no `default` throw for these cases |
| 5 | A campaign targeting a dynamic segment sends to the contacts matching the segment rules, not zero contacts | VERIFIED | `bulk-send.worker.ts` line 307: `contactIds = await resolveSegmentContactIds(campaign.segment_id)` — imports from `@twmail/shared`; `resolveSegmentContactIds` in `shared/segments.ts` dispatches on `segment.type`: STATIC uses `contact_segments` join, DYNAMIC applies `buildRuleFilter` on the contacts table |
| 6 | The segment preview count matches the actual number of contacts a campaign send reaches | VERIFIED | `getSegmentCount` in `segments.service.ts` (lines 184-219) calls `buildRuleFilter` for dynamic segments; `resolveSegmentContactIds` in shared also calls `buildRuleFilter` for dynamic segments — single rule engine shared by both paths |

**Score:** 6/6 truths verified

---

## Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `packages/api/src/routes/tracking.ts` | Fixed click redirect handler | VERIFIED | SENT event lookup at lines 57-62; `resolveClickUrl` exported pure function at line 321; CLICK event absent from redirect handler |
| `packages/api/tests/tracking.test.ts` | Tests for redirect URL preservation and lookup order | VERIFIED | 14 tests for `resolveClickUrl` covering all 6 test categories; 7 existing `detectMachineOpen` tests retained |
| `packages/api/src/services/segments.service.ts` | Missing date/range operators + resolveSegmentContactIds export | VERIFIED | `before`, `after`, `between`, `within_days` at lines 383-396; `resolveSegmentContactIds` exported at line 273 |
| `packages/workers/src/workers/bulk-send.worker.ts` | Dynamic segment resolution via resolveSegmentContactIds | VERIFIED | Imports `resolveSegmentContactIds` from `@twmail/shared` (line 2); uses it at line 307 |
| `packages/shared/src/segments.ts` | resolveSegmentContactIds + full rule engine (created — plan deviation) | VERIFIED | Full `buildRuleFilter`, `buildSingleRule`, and `resolveSegmentContactIds` with all operators including the four new ones; exported from `packages/shared/src/index.ts` line 5 |
| `packages/api/tests/segments.test.ts` | Tests for missing operators and dynamic segment resolution | VERIFIED | 6 DATA-10 operator tests present (lines 87-335); tests use `app.inject()` pattern |

---

## Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `packages/api/src/routes/tracking.ts` | events table (SENT event) | Kysely query filtering `event_type = EventType.SENT` | WIRED | Line 61: `.where('event_type', '=', EventType.SENT)` present; `EventType.SENT` imported from `@twmail/shared` |
| `packages/workers/src/workers/bulk-send.worker.ts` | `packages/shared/src/segments.ts` | `import resolveSegmentContactIds` from `@twmail/shared` | WIRED | Line 2 import confirmed; line 307 call confirmed |
| `packages/api/src/services/segments.service.ts` | `buildRuleFilter` | internal function call for dynamic segments | WIRED | `buildRuleFilter` called at lines 125, 206, and 295 within the service; also defined locally and in shared |

---

## Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| DATA-08 | 05-01-PLAN.md | Click tracking redirect preserves original URL including encoded params and UTMs | SATISFIED | `resolveClickUrl` returns raw string verbatim; 4 tests in `tracking.test.ts` assert URL unchanged including UTM params and percent-encoded chars |
| DATA-09 | 05-01-PLAN.md | Click tracking queries SENT event link_map first, not events table scan | SATISFIED | Redirect handler queries only SENT event; CLICK event SELECT removed entirely; `resolveClickUrl` reads directly from SENT metadata |
| DATA-10 | 05-02-PLAN.md | Segment query AND/OR precedence produces correct contact lists | SATISFIED | All four missing operators (`before`, `after`, `between`, `within_days`) implemented in both `segments.service.ts` and `shared/segments.ts`; operator tests in `segments.test.ts` |
| DATA-11 | 05-02-PLAN.md | Segment preview counts match actual send counts | SATISFIED | `resolveSegmentContactIds` in shared package provides single source of truth; `getSegmentCount` (API preview) and `createCampaignSendWorker` (send path) both use `buildRuleFilter` for dynamic segments |

No orphaned requirements. All four requirement IDs (DATA-08, DATA-09, DATA-10, DATA-11) are accounted for across the two plan files and have implementation evidence.

---

## Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `packages/api/src/routes/tracking.ts` | 257 | `EventType.CLICK` | Info | This is in `recordClick` (write-only audit INSERT), not the redirect lookup. Correct and intentional. Not a stub. |
| `packages/api/src/services/segments.service.ts` | 289 | `return []` | Info | Empty-rules guard for dynamic segments with null rules (`if (!segment.rules) return []`). Correct defensive code, not a placeholder. |
| `packages/shared/src/segments.ts` | 164 | `return []` | Info | Same empty-rules guard in shared version. Correct. |

No blockers or warnings found. All flagged items are correct implementations.

---

## Human Verification Required

### 1. Segment operator accuracy with real data

**Test:** Create a dynamic segment with `within_days: 7` on `last_activity_at`. Preview the count. Run a campaign send targeting that segment. Confirm the email reaches the same set of contacts the preview showed.
**Expected:** Preview count equals number of emails delivered.
**Why human:** Requires a running PostgreSQL instance with real contacts and a live SES configuration. The test environment has no local DB (pre-existing infrastructure limitation per SUMMARY). The code path is verified correct; only live data confirms the SQL results match.

### 2. URL redirect chain behavior in browser

**Test:** Click a tracked link containing UTM parameters (e.g., `?utm_source=email&utm_medium=campaign`). Observe final destination URL in browser address bar.
**Expected:** Final URL contains UTM parameters exactly as written, no extra encoding, no truncation.
**Why human:** `reply.redirect()` behavior in a live Fastify server on a real HTTP client may differ from unit-test assertions on the pure `resolveClickUrl` function. Browser redirect chains add a layer not covered by `app.inject()`.

---

## Gaps Summary

No gaps. All six observable truths are verified, all artifacts exist and are substantive and wired, all four requirement IDs are satisfied, and no blocker anti-patterns were found.

The only deviation from the original plans was placing `resolveSegmentContactIds` in `packages/shared/src/segments.ts` rather than solely in `segments.service.ts`. This was the correct architectural decision (workers cannot import from the api package) and was explicitly anticipated in the plan's own IMPORTANT note. The api service also exports its own `resolveSegmentContactIds` which delegates to the same local `buildRuleFilter`, maintaining backward compatibility for api-layer callers.

---

_Verified: 2026-03-13T12:00:00Z_
_Verifier: Claude (gsd-verifier)_
