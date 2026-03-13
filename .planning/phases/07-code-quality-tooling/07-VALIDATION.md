---
phase: 7
slug: code-quality-tooling
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-13
---

# Phase 7 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest + eslint + prettier |
| **Config file** | eslint.config.mjs, .prettierrc, vitest.config.ts |
| **Quick run command** | `npx eslint packages/{api,workers,shared}/src/ && npx vitest run` |
| **Full suite command** | `npx eslint packages/{api,workers,shared}/src/ && cd packages/api && npx vitest run && cd ../workers && npx vitest run` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run relevant lint/test command
- **After every plan wave:** Run full suite command
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 7-01-01 | 01 | 1 | QUAL-01, QUAL-02 | lint | `npx eslint packages/{api,workers,shared}/src/ --max-warnings 0` | ❌ W0 | ⬜ pending |
| 7-01-02 | 01 | 1 | QUAL-03 | lint | `npx prettier --check packages/{api,workers,shared}/src/` | ❌ W0 | ⬜ pending |
| 7-01-03 | 01 | 1 | QUAL-10 | grep | `grep -q "husky" package.json` | N/A | ⬜ pending |
| 7-02-01 | 02 | 2 | QUAL-04 | vitest | `cd packages/api && npx vitest run tests/webhooks-inbound.test.ts` | ❌ W0 | ⬜ pending |
| 7-02-02 | 02 | 2 | QUAL-05 | vitest | `cd packages/api && npx vitest run tests/bulk-send.test.ts` | ❌ W0 | ⬜ pending |
| 7-02-03 | 02 | 2 | QUAL-06, QUAL-07 | vitest | `cd packages/api && npx vitest run tests/segments.test.ts` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

*Existing infrastructure covers most requirements — ESLint and Vitest already installed. New config files created as part of tasks.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Pre-commit hook blocks bad commits | QUAL-10 | Requires actual git commit attempt | Stage a file with lint error, attempt `git commit`, verify rejection |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
