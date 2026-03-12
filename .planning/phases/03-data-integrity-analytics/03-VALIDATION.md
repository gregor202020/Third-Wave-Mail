---
phase: 3
slug: data-integrity-analytics
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-13
---

# Phase 3 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 2.x |
| **Config file** | none — Wave 0 installs |
| **Quick run command** | `npx vitest run --reporter=verbose` |
| **Full suite command** | `npx vitest run --coverage` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run grep-based verification
- **After every plan wave:** Run full grep verification suite
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 3-01-01 | 01 | 1 | DATA-01 | grep | `grep -q "userAgent\|user-agent" packages/api/src/routes/tracking.ts` | N/A | ⬜ pending |
| 3-01-02 | 01 | 1 | DATA-02 | grep | `grep -q "MACHINE_OPEN" packages/api/src/routes/tracking.ts` | N/A | ⬜ pending |
| 3-01-03 | 01 | 1 | DATA-03 | grep | `grep -q "campaign_variants\|total_human" packages/api/src/routes/tracking.ts` | N/A | ⬜ pending |
| 3-02-01 | 02 | 1 | DATA-04 | grep | `grep -q "minimum_sample\|min_sample\|sampleSize" packages/workers/src/workers/ab-eval.worker.ts` | N/A | ⬜ pending |
| 3-02-02 | 02 | 1 | DATA-05 | grep | `grep -q "first_open_at" packages/workers/src/workers/resend.worker.ts` | N/A | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

*Existing infrastructure covers all phase requirements — grep-based verification sufficient.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Apple MPP detection with real IP | DATA-01 | Requires real Apple Mail proxy traffic | Open email from Apple Mail, check event is MACHINE_OPEN |
| A/B test winner declaration timing | DATA-04 | Requires multi-variant campaign with real sends | Send A/B campaign to small list, verify no winner declared prematurely |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
