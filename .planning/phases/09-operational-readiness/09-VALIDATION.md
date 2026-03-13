---
phase: 9
slug: operational-readiness
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-13
---

# Phase 9 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest + grep-based verification |
| **Config file** | packages/api/vitest.config.ts |
| **Quick run command** | `cd packages/api && npx vitest run tests/ops.test.ts` |
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
| 9-01-01 | 01 | 1 | OPS-01 | grep | `grep -q "SENDING.*recovery\|stale.*SENDING\|stuck.*SENDING" packages/workers/src/scheduler.ts` | N/A | ⬜ pending |
| 9-01-02 | 01 | 1 | OPS-02 | grep | `grep -q "limiter" packages/workers/src/workers/bulk-send.worker.ts` | N/A | ⬜ pending |
| 9-01-03 | 01 | 1 | OPS-03 | unit | `cd packages/api && npx vitest run tests/ops.test.ts` | ❌ W0 | ⬜ pending |
| 9-02-01 | 02 | 1 | OPS-06 | unit | `cd packages/api && npx vitest run tests/ops.test.ts` | ❌ W0 | ⬜ pending |
| 9-02-02 | 02 | 1 | OPS-07 | grep | `grep -q "consecutive_failures\|auto.*disable" packages/workers/src/workers/webhook.worker.ts` | N/A | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

*Existing infrastructure covers all phase requirements — vitest already configured.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Campaign recovery after worker crash | OPS-01 | Requires killing worker mid-send | Start campaign, kill worker, restart, verify campaign transitions |
| Rate limit under load | OPS-02 | Requires sustained load test | Send 100+ emails, verify throughput ≤ 40/sec via logs |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 5s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
