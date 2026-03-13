---
phase: 10-email-output
verified: 2026-03-13T00:00:00Z
status: passed
score: 4/4 must-haves verified
re_verification: false
---

# Phase 10: Email Output Verification Report

**Phase Goal:** Every email rendered by the platform is valid HTML and contains only absolute URLs
**Verified:** 2026-03-13
**Status:** PASSED
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| #  | Truth                                                                              | Status     | Evidence                                                                      |
|----|------------------------------------------------------------------------------------|------------|-------------------------------------------------------------------------------|
| 1  | GrapesEditor.getHtml() returns compiled email HTML, not MJML XML                  | VERIFIED   | Lines 41-48: runCommand('mjml-code-to-html'), returns result.html ?? ''       |
| 2  | The onChange debounce callback also returns compiled HTML                          | VERIFIED   | Lines 109-113: handleUpdate uses runCommand('mjml-code-to-html'), passes html |
| 3  | Bulk-send worker rejects email HTML containing relative src or href values         | VERIFIED   | Line 125: assertAbsoluteUrls(html, campaignId) before merge-tag processing    |
| 4  | Bulk-send worker detects and rejects uncompiled MJML source as a defensive guard  | VERIFIED   | Lines 119-122: isMjmlSource guard returns { skipped: true, reason: 'uncompiled_mjml' } |

**Score:** 4/4 truths verified

### Required Artifacts

| Artifact                                                          | Expected                                             | Status     | Details                                                              |
|-------------------------------------------------------------------|------------------------------------------------------|------------|----------------------------------------------------------------------|
| `packages/frontend/src/components/editor/grapes-editor.tsx`      | MJML-to-HTML compilation via runCommand              | VERIFIED   | Lines 41-48 and 109-113 both use runCommand('mjml-code-to-html')     |
| `packages/workers/src/email-output.ts`                            | assertAbsoluteUrls and isMjmlSource exports          | VERIFIED   | Both functions exported, 39 lines, substantive implementation        |
| `packages/workers/src/workers/bulk-send.worker.ts`                | Pre-send guards for MJML detection and URL checking  | VERIFIED   | Guards wired at lines 119-125, before merge-tag processing           |
| `packages/api/tests/email-output.unit.test.ts`                    | Unit tests for both guard functions (min 40 lines)   | VERIFIED   | 23 test cases, 146 lines — exceeds min_lines requirement              |

Note on min_lines: The PLAN specifies min_lines: 40 for the test file. The file is 146 lines with 23 test cases, well above the threshold.

### Key Link Verification

| From                             | To                                      | Via                                             | Status  | Details                                              |
|----------------------------------|-----------------------------------------|-------------------------------------------------|---------|------------------------------------------------------|
| grapes-editor.tsx                | grapesjs-mjml runCommand                | editor.runCommand('mjml-code-to-html')          | WIRED   | Found at lines 41 and 109 — both getHtml and debounce |
| bulk-send.worker.ts              | packages/workers/src/email-output.ts    | import { assertAbsoluteUrls, isMjmlSource }     | WIRED   | Line 16: import { assertAbsoluteUrls, isMjmlSource } from '../email-output.js' |

### Requirements Coverage

| Requirement | Source Plan | Description                                              | Status    | Evidence                                                                        |
|-------------|-------------|----------------------------------------------------------|-----------|---------------------------------------------------------------------------------|
| OPS-04      | 10-01-PLAN  | MJML output valid across all editor block combinations   | SATISFIED | isMjmlSource guard in bulk-send rejects uncompiled MJML; editor compiles on save |
| OPS-05      | 10-01-PLAN  | Image URLs in email output are absolute, not relative    | SATISFIED | assertAbsoluteUrls throws on relative src/href; 23 unit tests covering all cases |

Both OPS-04 and OPS-05 are mapped to Phase 10 in REQUIREMENTS.md traceability table and are the only requirements claimed by this phase's plan. No orphaned requirements found.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| — | — | None found | — | — |

No TODOs, FIXMEs, placeholder returns (`return null`, `return {}`, `return []`), empty handlers, or console.log-only implementations found in any of the four modified files.

Confirmed absence of forbidden patterns in grapes-editor.tsx:
- `editor.getHtml()` — no matches (replaced with runCommand)
- `getCss()` — no matches (removed; MJML inlines all styles)

### Human Verification Required

None. All observable behaviors are verifiable through static code analysis:
- Compilation logic is deterministic code (not visual/UX-dependent)
- Guard functions have comprehensive unit test coverage (23 tests)
- Import wiring is directly readable in source

## Gaps Summary

No gaps. All four observable truths are verified, all artifacts exist and are substantive, all key links are wired, and both requirements (OPS-04, OPS-05) are satisfied.

The phase goal — every email rendered by the platform is valid HTML and contains only absolute URLs — is achieved through two complementary mechanisms:

1. **Compile-time:** GrapesEditor now returns compiled HTML (not MJML XML) from both `getHtml()` and the onChange debounce callback. Raw MJML never reaches the API or storage layer.

2. **Send-time:** The bulk-send worker has two defensive guards before merge-tag processing — a soft guard that skips jobs with uncompiled MJML source (OPS-04), and a hard guard that fails jobs containing relative URLs (OPS-05). Unit tests cover all pass/fail cases for both guards.

---

_Verified: 2026-03-13_
_Verifier: Claude (gsd-verifier)_
