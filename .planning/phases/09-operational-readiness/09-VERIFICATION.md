---
phase: 09-operational-readiness
verified: 2026-03-13T03:30:00Z
status: passed
score: 7/7 must-haves verified
re_verification: false
---

# Phase 9: Operational Readiness Verification Report

**Phase Goal:** The system recovers from failures and respects operational constraints
**Verified:** 2026-03-13T03:30:00Z
**Status:** PASSED
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Webhook delivery jobs reach the BullMQ worker (not lost in a raw Redis list) | VERIFIED | `webhooks.service.ts` line 142: `new Queue('webhook', ...)` + `queue.add('deliver', {...})`. Raw `redis.lpush` removed. Queue name 'webhook' matches worker listener. |
| 2 | Webhook endpoints that fail 50 consecutive times are automatically disabled | VERIFIED | `webhook.worker.ts` line 113-114: `if (endpoint && endpoint.failure_count >= 50) { ... set({ active: false }) }`. Source-scan test confirms threshold. |
| 3 | HMAC signature comparison uses crypto.timingSafeEqual, not string equality | VERIFIED | `packages/api/src/utils/hmac.ts` line 26: `return timingSafeEqual(expectedBuf, receivedBuf)`. Length-mismatch returns false before call (prevents throw). |
| 4 | Bulk-send worker rate limiter is configured at max=40 duration=1000 | VERIFIED | `bulk-send.worker.ts` lines 270-272: `limiter: { max: 40, duration: 1000 }`. Concurrency set to 25, well within limit. |
| 5 | A campaign stuck in SENDING for longer than 10 minutes is re-enqueued by the scheduler | VERIFIED | `scheduler.ts` lines 53-64: staleThreshold query on `send_started_at`, re-enqueues via `campaignSendQueue.add('send', ...)`. STALE_SENDING_THRESHOLD_MS = 600_000 exported. |
| 6 | A scheduled campaign with a timezone-offset ISO string stores the correct UTC datetime | VERIFIED | `campaigns.service.ts` line 197: `new Date(data.scheduled_at)` — ECMA-262 handles ISO 8601 offsets. Route Zod schema line 51: `z.string().datetime()` enforces offset format. |
| 7 | The scheduler does not change campaign status when re-enqueuing stuck campaigns | VERIFIED | `scheduler.ts` stall recovery block (lines 53-64) contains no `updateTable` call. Only one `updateTable` in file (SCHEDULED -> SENDING transition). Confirmed by source-scan test. |

**Score:** 7/7 truths verified

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `packages/api/src/services/webhooks.service.ts` | BullMQ Queue.add() instead of redis.lpush for webhook delivery | VERIFIED | Imports `Queue, ConnectionOptions` from 'bullmq'. Uses `new Queue('webhook', ...)` + `queue.add('deliver', {...})` + `queue.close()`. No lpush. |
| `packages/api/src/utils/hmac.ts` | Constant-time HMAC verification utility exporting verifyHmacSignature | VERIFIED | 27 lines. Exports `verifyHmacSignature`. Uses `timingSafeEqual` from crypto. Length-mismatch guard in place. |
| `packages/api/tests/webhook-queue-wiring.unit.test.ts` | Test confirming BullMQ queue usage | VERIFIED | 128 lines. 4 tests: Queue named 'webhook', add called with 'deliver' handler and correct shape, close called, lpush NOT called. Mocks bullmq and @twmail/shared. |
| `packages/api/tests/hmac-constant-time.unit.test.ts` | Test confirming timingSafeEqual usage | VERIFIED | 67 lines. 5 tests: valid sig returns true, invalid returns false, shorter sig returns false (no throw), empty sig returns false (no throw), source-code scan confirms timingSafeEqual import. |
| `packages/api/tests/bulk-send-rate-limit.unit.test.ts` | Test confirming rate limiter config | VERIFIED | 49 lines. 5 tests: source-scan confirms max: 40 and duration: 1000 in limiter block, concurrency <= 40, both values present together. |
| `packages/api/tests/webhook-auto-disable.unit.test.ts` | Test confirming auto-disable threshold | VERIFIED | 44 lines. 5 tests: source-scan confirms failure_count >= 50, active: false set, failure_count: 0 reset on success, failure_count incremented via expression builder. |
| `packages/workers/src/scheduler.ts` | SENDING stall detection and re-enqueue logic | VERIFIED | 78 lines. Exports STALE_SENDING_THRESHOLD_MS = 600_000. Stall recovery block queries SENDING campaigns with send_started_at <= staleThreshold and re-enqueues without status mutation. |
| `packages/api/tests/scheduler-recovery.unit.test.ts` | Test for stuck SENDING campaign re-enqueue | VERIFIED | 51 lines. 6 tests: exports correct constant value (600_000), source-scan confirms SENDING check, send_started_at comparison, constant declaration, campaignSendQueue.add call, and single updateTable assertion. |
| `packages/api/tests/campaign-schedule-tz.unit.test.ts` | Test for timezone-correct scheduling | VERIFIED | 62 lines. 7 tests: +11:00 offset converts to correct UTC, Z suffix passes through, +10:00 DST offset correct, service uses new Date(data.scheduled_at), route enforces z.string().datetime(). |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `packages/api/src/services/webhooks.service.ts` | `packages/workers/src/workers/webhook.worker.ts` | BullMQ queue named 'webhook' | WIRED | Service creates `Queue('webhook', ...)` and calls `queue.add('deliver', jobData)`. Worker creates `Worker('webhook', handler)`. Queue name matches. Handler name 'deliver' matches worker processor. |
| `packages/workers/src/scheduler.ts` | BullMQ campaign-send queue | `campaignSendQueue.add('send', { campaignId })` | WIRED | Line 62: `await campaignSendQueue.add('send', { campaignId: campaign.id })` in stall recovery block. Queue named 'campaign-send' matching worker convention. |
| `packages/api/src/services/campaigns.service.ts` | PostgreSQL campaigns table | `scheduled_at` stored as UTC Date | WIRED | Line 197: `const scheduledAt = new Date(data.scheduled_at)` — Zod enforces ISO 8601 with offset on input. Route passes through to db `set({ scheduled_at: scheduledAt })`. |

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| OPS-01 | 09-02-PLAN.md | Campaign state machine recovers correctly after worker crash (not stuck in SENDING) | SATISFIED | scheduler.ts stall recovery re-enqueues SENDING campaigns older than 10 minutes. scheduler-recovery test passes. |
| OPS-02 | 09-01-PLAN.md | SES rate limit respected under bulk send (worker concurrency <= 40/sec) | SATISFIED | bulk-send.worker.ts has `limiter: { max: 40, duration: 1000 }`, concurrency: 25. Webhook queue wiring fixed so jobs reach worker. bulk-send-rate-limit test confirms config. |
| OPS-03 | 09-02-PLAN.md | Scheduled campaign timezone conversion correct (stored as UTC, evaluated correctly) | SATISFIED | campaigns.service.ts uses `new Date(data.scheduled_at)`. Zod enforces ISO 8601 datetime with offset. campaign-schedule-tz test confirms UTC conversion for +11:00, Z, and +10:00 DST offsets. |
| OPS-06 | 09-01-PLAN.md | Webhook HMAC uses constant-time comparison | SATISFIED | verifyHmacSignature utility created in packages/api/src/utils/hmac.ts using crypto.timingSafeEqual. Phase scope was utility delivery; no inbound verification route exists in this codebase — utility is ready for future use. |
| OPS-07 | 09-01-PLAN.md | Webhook endpoint auto-disable after 50 failures works correctly | SATISFIED | webhook.worker.ts has failure_count >= 50 threshold setting active: false. Queue wiring fix (OPS-02) makes this path reachable. webhook-auto-disable test confirms all three state changes. |

**Note on OPS-04 and OPS-05:** These requirements are assigned to Phase 10 per REQUIREMENTS.md. They are not claimed by any Phase 9 plan and are correctly out of scope for this verification.

---

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| None found | — | — | — | — |

No TODOs, placeholders, empty implementations, or stub patterns found in any phase-9-modified files.

---

### Human Verification Required

None. All phase 9 deliverables are unit-testable structural/logic properties verified by source-code scan tests or mock-based unit tests. No visual, real-time, or external-service behavior is involved.

---

### Commit Verification

All commits documented in SUMMARY files exist in git log:

| Commit | Description | Status |
|--------|-------------|--------|
| de3b226 | feat(09-01): fix webhook queue wiring + add constant-time HMAC utility | CONFIRMED |
| a5a05a6 | test(09-01): verify bulk-send rate limiter config and webhook auto-disable threshold | CONFIRMED |
| 5a20fe2 | feat(09-02): add SENDING stall recovery to scheduler | CONFIRMED |

---

### Gaps Summary

No gaps. All 7 observable truths verified. All 9 artifacts exist and are substantive. All 3 key links confirmed wired. All 5 requirements (OPS-01, OPS-02, OPS-03, OPS-06, OPS-07) satisfied with implementation evidence.

The one item worth noting: `verifyHmacSignature` (OPS-06) is an exported utility not yet called by any route or worker. The webhook worker signs outbound requests with its own inline `createHmac` (correct behavior — it is the sender, not a verifier). The utility is correctly scoped as infrastructure for any future inbound HMAC verification endpoint. The phase plan explicitly scoped OPS-06 as utility delivery only, and the truth "HMAC signature comparison uses crypto.timingSafeEqual" is satisfied by the utility's implementation.

---

_Verified: 2026-03-13T03:30:00Z_
_Verifier: Claude (gsd-verifier)_
