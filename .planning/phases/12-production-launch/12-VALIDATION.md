---
phase: 12
slug: production-launch
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-13
---

# Phase 12 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest + grep-based verification |
| **Config file** | packages/api/vitest.config.ts |
| **Quick run command** | `cd packages/api && npx vitest run tests/production-readiness.test.ts` |
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
| 12-01-01 | 01 | 1 | OBS-04, OBS-05 | unit | `cd packages/api && npx vitest run tests/production-readiness.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

*Existing infrastructure covers all phase requirements — vitest already configured.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| SES domain identity verified in AWS console | OBS-04 | Requires AWS account access | Run `npx tsx scripts/verify-ses-dns.ts` against production domain |
| External uptime monitor alerting on outage | OBS-05 | Requires external service setup | Configure UptimeRobot/BetterStack, trigger test alert |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 5s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
