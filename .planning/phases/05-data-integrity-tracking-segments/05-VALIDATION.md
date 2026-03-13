---
phase: 5
slug: data-integrity-tracking-segments
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-13
---

# Phase 5 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest + grep-based verification |
| **Config file** | packages/api/vitest.config.ts |
| **Quick run command** | `cd packages/api && npx vitest run tests/tracking.test.ts tests/segments.test.ts` |
| **Full suite command** | `cd packages/api && npx vitest run` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run quick test command
- **After every plan wave:** Run full suite command
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 5 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 5-01-01 | 01 | 1 | DATA-08, DATA-09 | unit | `cd packages/api && npx vitest run tests/tracking.test.ts` | ❌ W0 | ⬜ pending |
| 5-02-01 | 02 | 1 | DATA-10 | unit | `cd packages/api && npx vitest run tests/segments.test.ts` | ❌ W0 | ⬜ pending |
| 5-02-02 | 02 | 1 | DATA-11 | grep | `grep -q "resolveSegmentContactIds" packages/workers/src/workers/bulk-send.worker.ts` | N/A | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

*Existing infrastructure covers all phase requirements — vitest already configured.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Click redirect preserves UTM params end-to-end | DATA-08 | Requires real HTTP redirect | Send test email, click tracked link, verify destination URL |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 5s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
