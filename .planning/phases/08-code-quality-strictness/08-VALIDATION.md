---
phase: 8
slug: code-quality-strictness
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-13
---

# Phase 8 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | TypeScript compiler + ESLint + grep |
| **Config file** | tsconfig.json, eslint.config.mjs |
| **Quick run command** | `npx tsc --noEmit -p packages/api/tsconfig.json && npx tsc --noEmit -p packages/workers/tsconfig.json` |
| **Full suite command** | `npx tsc --noEmit -p packages/api/tsconfig.json && npx tsc --noEmit -p packages/workers/tsconfig.json && npx tsc --noEmit -p packages/shared/tsconfig.json && npx eslint packages/{api,workers,shared}/src/` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run quick tsc check
- **After every plan wave:** Run full suite command
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 8-01-01 | 01 | 1 | QUAL-08 | tsc | `npx tsc --noEmit -p packages/api/tsconfig.json && npx tsc --noEmit -p packages/workers/tsconfig.json && npx tsc --noEmit -p packages/shared/tsconfig.json` | N/A | ⬜ pending |
| 8-01-02 | 01 | 1 | QUAL-09 | grep | `! grep -rn '"error":' packages/api/src/routes/ \| grep -v 'code.*message\|AppError\|test'` | N/A | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

*Existing infrastructure covers all phase requirements.*

---

## Manual-Only Verifications

*All phase behaviors have automated verification.*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
