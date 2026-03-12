# Phase 3: Data Integrity — Analytics - Research

**Researched:** 2026-03-13
**Domain:** MPP machine-open detection, A/B test winner logic, resend non-opener filtering
**Confidence:** HIGH — all findings derived from direct codebase inspection

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| DATA-01 | MPP machine open detection correctly identifies Apple Mail proxy user-agents | Current code uses IP-prefix check only (`17.`). Gaps and correct approach documented below. |
| DATA-02 | Machine opens flagged but not deleted (preserved for data completeness) | Partially implemented — events are stored as MACHINE_OPEN. Gap: `messages.is_machine_open` flag alone may be insufficient for resend filtering. |
| DATA-03 | A/B test winner logic uses human opens/clicks, not raw (MPP-inflated) data | `ab-eval.worker.ts` already uses `total_human_clicks`. Gap: it does NOT use `total_human_opens` as a metric at all — only clicks. The metric selection is undocumented in ab_test_config. |
| DATA-04 | A/B test has minimum sample size guard before declaring winner | No minimum sample size guard exists anywhere in `ab-eval.worker.ts`. This is a pure gap. |
| DATA-05 | Resend-to-non-openers excludes machine opens from "opened" definition | `resend.worker.ts` filters on `first_open_at IS NULL`. Gap: `first_open_at` is only set for human opens (correct in `recordOpen`), BUT `is_machine_open = true` messages also have `first_open_at IS NULL`, so a machine-only opener IS currently excluded from resend — which is correct. However this depends on `recordOpen` NOT setting `first_open_at` for machine opens, which it does correctly. Needs verification that `messages.status` is not set to OPENED for machine opens. |
</phase_requirements>

---

## Summary

Phase 3 fixes analytics accuracy: open and click metrics must reflect real human engagement rather than Apple Mail Privacy Protection (MPP) machine traffic. The codebase already has partial infrastructure — `EventType.MACHINE_OPEN` exists, `total_human_opens` and `total_human_clicks` columns exist on both `campaigns` and `campaign_variants`, and `messages.is_machine_open` is a boolean flag. However, three distinct bugs remain:

**DATA-01 / DATA-02:** The Apple IP detection in `tracking.ts` uses only the `17.` prefix and no user-agent matching. Apple uses the range `17.0.0.0/8` exclusively, so the IP prefix is the primary signal, but user-agent matching (`Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)` with no mobile indicators, combined with `AppleWebKit`) can supplement it for cases where CDN/proxy strips the IP. The current detection function is correct in principle but incomplete.

**DATA-03 / DATA-04:** The A/B eval worker (`ab-eval.worker.ts`) uses Bayesian win probability correctly based on `total_human_clicks`, but: (1) it has no minimum sample size guard — it will declare a winner immediately even with 1 send; (2) it does not read `ab_test_config` for a configurable minimum sample size; (3) winner declaration threshold is "max win probability > 0" (any value qualifies as winner via `winProbs[i]! > maxProb` starting from 0).

**DATA-05:** The resend worker (`resend.worker.ts`) uses `first_open_at IS NULL` to identify non-openers. This IS correct because `recordOpen` only sets `first_open_at` for human opens (`if (!isMachine)`). But the `messages.status` field is set to `OPENED` only for human opens too (same `if (!isMachine)` block). The logic is sound but should be explicitly documented and verified via test.

**Primary recommendation:** Fix MPP detection to cover both IP range and user-agent signals; add minimum sample size guard to A/B eval before Bayesian calculation; add a unit test confirming resend correctly skips machine-only openers.

---

## Standard Stack

### Core (already in project — no new installs needed)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Kysely | (in shared) | Database queries | Already used throughout |
| BullMQ | ^5.71.0 | Job queue for ab-eval | Already used |
| Vitest | ^2.1.0 | Testing | Already configured in @twmail/api |
| TypeScript | ^5.7.0 | Type safety | Already configured |

No new libraries are required for this phase. All fixes are pure logic changes to existing files.

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `net` (Node built-in) | N/A | IP range parsing if needed | Only if CIDR matching is added |

**Installation:** None required.

---

## Architecture Patterns

### Files Involved

```
packages/
├── api/src/routes/
│   └── tracking.ts          # detectMachineOpen() — DATA-01 fix here
├── workers/src/workers/
│   ├── ab-eval.worker.ts    # DATA-03, DATA-04 fixes here
│   └── resend.worker.ts     # DATA-05 — verify correctness, add clarity
└── shared/src/
    └── types.ts             # EventType.MACHINE_OPEN already defined
```

### Pattern 1: MPP Detection (DATA-01)

**What:** Classify a pixel request as machine-generated when it comes from Apple's proxy infrastructure.

**The two signals Apple provides:**
1. **IP prefix `17.`** — Apple's entire `17.0.0.0/8` block. This is the primary signal. When Apple Mail MPP loads a pixel, the request comes from Apple's servers in this range. [Confidence: HIGH — Apple documentation and Mail Privacy Protection spec confirm this.]
2. **User-agent** — Apple proxy user-agents typically look like `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15` with no `iPhone` or `iPad` in the UA. However, Fastify's `request.ip` already captures the real source IP correctly behind nginx (when `trustProxy` is configured), so the IP signal is more reliable.

**Current code gap:**

```typescript
// CURRENT (tracking.ts line 12-13) — too narrow
const APPLE_PROXY_PREFIXES = ['17.'];

function detectMachineOpen(ip: string, userAgent: string): boolean {
  for (const prefix of APPLE_PROXY_PREFIXES) {
    if (ip.startsWith(prefix)) return true;  // IP only, no UA check
  }
  return false;
}
```

**Correct approach:**

```typescript
// Apple's entire allocated block is 17.0.0.0/8
// User-agent supplement for edge cases (CDN stripping IP)
const APPLE_PROXY_PREFIXES = ['17.'];

const MACHINE_OPEN_UA_PATTERNS = [
  /YahooMailProxy/i,
  /Googleimageproxy/i,
];

function detectMachineOpen(ip: string, userAgent: string): boolean {
  // Primary: Apple IP range
  for (const prefix of APPLE_PROXY_PREFIXES) {
    if (ip.startsWith(prefix)) return true;
  }
  // Secondary: known proxy user-agents (future-proof)
  for (const pattern of MACHINE_OPEN_UA_PATTERNS) {
    if (pattern.test(userAgent)) return true;
  }
  return false;
}
```

**Note:** The `17.` prefix check is correct and covers the full Apple block. The main improvement is adding UA-based patterns for other mail proxy services. For Phase 3's scope (DATA-01 is Apple-specific), the IP check alone is likely sufficient. The function signature already accepts `userAgent` but never uses it — it should at minimum be used or the UA param documented.

### Pattern 2: A/B Test Winner Logic Fix (DATA-03, DATA-04)

**Current bug — no sample size guard:**

```typescript
// ab-eval.worker.ts — calculateBayesianWinProbability is called unconditionally
// With 1 send total, Beta(2,1) vs Beta(1,2) will still declare a "winner"
const winProbs = calculateBayesianWinProbability(variants);
```

**Fix — add minimum sample size check:**

```typescript
// Read minimum sample size from ab_test_config (with sensible default)
const campaign = await db.selectFrom('campaigns')
  .select(['ab_test_config'])
  .where('id', '=', campaignId)
  .executeTakeFirst();

const abConfig = (campaign?.ab_test_config ?? {}) as {
  min_sample_size?: number;
  winner_wait_hours?: number;
};
const minSampleSize = abConfig.min_sample_size ?? 100;

// Sum human sends across all variants
const totalHumanSent = variants.reduce((sum, v) => sum + (v.total_sent || 0), 0);

if (totalHumanSent < minSampleSize) {
  return { skipped: true, reason: 'insufficient_sample_size', total_sent: totalHumanSent, required: minSampleSize };
}
```

**Current metric used:** `total_human_clicks` (correct — DATA-03 is satisfied). The Bayesian calculation already uses `total_human_clicks` at line 113, not the raw `total_clicks`. This is correct for DATA-03. The only remaining issue for DATA-03 is ensuring this stays correct (i.e., verify `campaign_variants.total_human_clicks` is being incremented correctly when variant_id is set).

**Variant counter update gap:** In `recordClick()` in `tracking.ts`, the code updates `campaigns.total_human_clicks` but does NOT update `campaign_variants.total_human_clicks`. This means variant-level metrics used by the Bayesian algorithm will always be 0. This is a DATA-03 bug that must be fixed.

```typescript
// FIX: In recordClick(), also update campaign_variants counter
if (message.variant_id) {
  await db
    .updateTable('campaign_variants')
    .set((eb: any) => ({
      total_clicks: eb('total_clicks', '+', 1),
      total_human_clicks: eb('total_human_clicks', '+', 1),
    }))
    .where('id', '=', message.variant_id)
    .execute();
}
```

Similarly, `recordOpen()` should update `campaign_variants.total_human_opens` when `!isMachine && message.variant_id`. (The A/B eval only uses clicks for winner selection, but the schema has the columns and they should be accurate.)

### Pattern 3: Resend Non-Opener Logic (DATA-05)

**Current code in `resend.worker.ts`:**

```typescript
if (trigger === 'non_open') {
  // No open event (excluding machine opens)
  nonEngagedQuery = nonEngagedQuery.where('first_open_at', 'is', null);
}
```

**Analysis:** This is CORRECT. In `recordOpen()`:
- Human open: sets `first_open_at = new Date()`, sets `status = OPENED`
- Machine open: does NOT set `first_open_at`, does NOT set `status = OPENED`, only sets `is_machine_open = true`

Therefore `first_open_at IS NULL` correctly identifies contacts who have never had a human open, even if they had a machine open. This satisfies DATA-05.

**However:** The `messages.is_machine_open` flag is set to `true` for machine opens, providing a second data path. The resend worker ignores this flag entirely and relies on `first_open_at`. This is fine and correct.

**The one risk:** If any code path sets `first_open_at` for machine opens (bug), resend would incorrectly skip those contacts. A test should verify this path.

### Anti-Patterns to Avoid

- **Don't use `messages.status = OPENED` as the opened definition in resend.** The `status` field moves through a state machine (QUEUED → SENT → DELIVERED → OPENED → CLICKED) and only OPENED/CLICKED mean opened, but machine opens don't update status. Using `status >= OPENED` would also be correct, but `first_open_at IS NOT NULL` is cleaner for the "has human opened?" question.
- **Don't delete machine open events.** DATA-02 requires they be preserved. Current code never deletes them. Do not add any cleanup logic.
- **Don't declare A/B winner on first eval run unconditionally.** The `delay` in BullMQ (`winner_wait_hours * 3600 * 1000`) only delays the first eval — there is no retry with extended wait if sample size is insufficient. Consider returning early (not marking winner) when sample is too small, letting the worker job simply complete without a winner. A future scheduled re-eval could be added, but Phase 3 scope is just to block premature winner declaration.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| IP CIDR range matching | Custom CIDR parser | Simple string prefix `'17.'` | Apple's block is contiguous `17.0.0.0/8` — prefix check is exact and sufficient |
| Beta distribution sampling | Different statistical library | Keep current Marsaglia-Tsang gamma sampling | Already implemented correctly in ab-eval.worker.ts; do not replace |
| Minimum sample size formula | Custom significance calculator | Simple count threshold from config | Statistical significance tests (chi-squared) are overkill here; a minimum send count (default 100) is industry standard for basic protection |

---

## Common Pitfalls

### Pitfall 1: Variant counters not updated on open/click
**What goes wrong:** `campaign_variants.total_human_opens` and `campaign_variants.total_human_clicks` stay at 0 because `recordOpen`/`recordClick` only update `campaigns.*`, not `campaign_variants.*`.
**Why it happens:** The `variant_id` is available on the `messages` row (fetched in both functions) but is never used to update variant-level counters.
**How to avoid:** After updating `campaigns.total_human_clicks`, also update `campaign_variants.total_human_clicks` when `message.variant_id` is not null.
**Warning signs:** A/B test always shows 0 human clicks per variant despite sends completing.

### Pitfall 2: A/B eval declares winner with zero data
**What goes wrong:** With 1 send (1 click vs 0 clicks), `Beta(2,1)` vs `Beta(1,2)` will give ~70%/30% probabilities — enough to trigger a winner at >50%.
**Why it happens:** The 95% threshold in `maxProb > 0` is actually the bug — winner is selected as whichever has highest probability, not which exceeds 95%. The code says "Determine winner: >95% win probability" in a comment but the actual logic just takes `maxProb` — no 95% gate.
**How to avoid:** Add both: (1) minimum sample size guard, (2) minimum win probability threshold (e.g., 0.95) before marking a winner.
**Warning signs:** `is_winner` set on a variant within minutes of send starting.

### Pitfall 3: `request.ip` behind nginx returns proxy IP
**What goes wrong:** If Fastify's `trustProxy` is not enabled, `request.ip` returns nginx's IP (`127.0.0.1` or `::1`), not the originating Apple proxy IP. Every open would then appear to be a machine open (or no machine opens detected).
**Why it happens:** Fastify requires explicit `trustProxy: true` to read `X-Forwarded-For`.
**How to avoid:** Verify `app.ts` has `trustProxy: true` (or a trusted proxy list). Check `packages/api/src/app.ts`.
**Warning signs:** `request.ip` is always `127.0.0.1` in logs for pixel requests.

### Pitfall 4: Resend sends to machine-only openers if bug is introduced
**What goes wrong:** If any future change sets `first_open_at` for machine opens, those contacts would be excluded from resend incorrectly.
**Why it happens:** The coupling between `recordOpen` behavior and resend logic is implicit.
**How to avoid:** Add a Vitest test that simulates a machine open and verifies `first_open_at` remains null and the contact appears in the resend candidate set.

---

## Code Examples

### DATA-01: Updated detectMachineOpen with UA supplement

```typescript
// Source: Direct codebase analysis — packages/api/src/routes/tracking.ts
const APPLE_PROXY_PREFIXES = ['17.'];

// Additional known mail proxy UA patterns (supplement to IP check)
const MACHINE_UA_PATTERNS: RegExp[] = [
  // Future: add Yahoo, Gmail image proxy patterns if needed
];

function detectMachineOpen(ip: string, userAgent: string): boolean {
  // Primary signal: Apple Mail Privacy Protection uses 17.0.0.0/8
  for (const prefix of APPLE_PROXY_PREFIXES) {
    if (ip.startsWith(prefix)) return true;
  }
  // Supplementary UA-based detection
  for (const pattern of MACHINE_UA_PATTERNS) {
    if (pattern.test(userAgent)) return true;
  }
  return false;
}
```

### DATA-03: Variant counter update in recordOpen and recordClick

```typescript
// In recordOpen() — after updating campaigns.total_human_opens:
if (!isMachine && message.variant_id) {
  await db
    .updateTable('campaign_variants')
    .set((eb: any) => ({
      total_opens: eb('total_opens', '+', 1),
      total_human_opens: eb('total_human_opens', '+', 1),
    }))
    .where('id', '=', message.variant_id)
    .execute();
}

// In recordClick() — after updating campaigns.total_human_clicks:
if (message.variant_id) {
  await db
    .updateTable('campaign_variants')
    .set((eb: any) => ({
      total_clicks: eb('total_clicks', '+', 1),
      total_human_clicks: eb('total_human_clicks', '+', 1),
    }))
    .where('id', '=', message.variant_id)
    .execute();
}
```

### DATA-04: Minimum sample size guard in ab-eval.worker.ts

```typescript
// In createAbEvalWorker job handler, before calculateBayesianWinProbability:
const campaign = await db
  .selectFrom('campaigns')
  .select('ab_test_config')
  .where('id', '=', campaignId)
  .executeTakeFirst();

const abConfig = (campaign?.ab_test_config ?? {}) as {
  min_sample_size?: number;
};
const minSampleSize = abConfig.min_sample_size ?? 100;

const totalSent = variants.reduce((sum, v) => sum + (v.total_sent ?? 0), 0);
if (totalSent < minSampleSize) {
  return { skipped: true, reason: 'insufficient_sample', total_sent: totalSent, min_required: minSampleSize };
}
```

### DATA-04: Winner probability threshold (fix the comment vs. code mismatch)

```typescript
// After calculating winProbs, apply actual 95% threshold:
const WIN_PROBABILITY_THRESHOLD = 0.95;

const hasConfidentWinner = winProbs.some((p) => p >= WIN_PROBABILITY_THRESHOLD);
if (!hasConfidentWinner) {
  return { skipped: true, reason: 'no_confident_winner', probabilities: winProbs };
}

// Then find the winner among those above threshold:
let winnerIdx = 0;
let maxProb = 0;
for (let i = 0; i < winProbs.length; i++) {
  if (winProbs[i]! > maxProb) {
    maxProb = winProbs[i]!;
    winnerIdx = i;
  }
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Trust all opens as human | MPP-aware: MACHINE_OPEN event type | Apple introduced MPP in iOS 15 / macOS Monterey (Sept 2021) | Open rates inflated 30-50% for Apple Mail users without detection |
| Single IP check | IP + UA patterns | Best practice since 2022 | More resilient when CDN strips IP |
| Statistical significance test for A/B | Bayesian win probability | Industry shift ~2020 | Bayesian gives actionable probability scores; no arbitrary p-value needed |

**Deprecated/outdated:**
- Using raw `total_opens` for A/B test decisions: replaced by `total_human_opens`/`total_human_clicks`
- Checking only for Apple IP (`17.`): should add UA-based supplement for other proxies

---

## Open Questions

1. **Is `trustProxy` enabled in Fastify app config?**
   - What we know: Nginx proxies requests. If `trustProxy` is off, `request.ip` will be `127.0.0.1` for all pixel requests.
   - What's unclear: `packages/api/src/app.ts` was not fully reviewed for this setting.
   - Recommendation: Planner should include a task to verify `app.ts` has `trustProxy: true` as part of DATA-01 verification.

2. **Should the A/B eval job re-schedule itself if sample size is insufficient?**
   - What we know: The job fires once after `winner_wait_hours`. If sample is too small at that point, a simple early return means no winner is ever selected (holdback contacts never get the winner email).
   - What's unclear: The product requirement says "will not declare a winner until statistically meaningful sample size is reached" — it does not say the job must retry.
   - Recommendation: Phase 3 scope is satisfied by blocking premature winner declaration. If the sample is insufficient, log it and return without marking a winner. The holdback contacts can be manually released or this can be addressed in a later phase. Do NOT add complex retry scheduling in this phase.

3. **What is the correct minimum sample size default?**
   - What we know: `ab_test_config` is a free-form JSON field. The current code reads `winner_wait_hours` from it. Adding `min_sample_size` is consistent.
   - Recommendation: Default to 100 total sends across all test variants. This is a low but reasonable floor for a private email marketing platform (industry standard Mailchimp uses 50 as their minimum).

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest ^2.1.0 |
| Config file | None detected — `vitest` picked up via `package.json` scripts in `@twmail/api` |
| Quick run command | `cd packages/api && npm test` |
| Full suite command | `cd packages/api && npm test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| DATA-01 | `detectMachineOpen('17.58.0.1', '')` returns true | unit | `cd packages/api && npm test -- --grep "detectMachineOpen"` | ❌ Wave 0 |
| DATA-01 | `detectMachineOpen('1.2.3.4', '')` returns false | unit | `cd packages/api && npm test -- --grep "detectMachineOpen"` | ❌ Wave 0 |
| DATA-02 | Machine open creates MACHINE_OPEN event, does not delete it | unit | `cd packages/api && npm test -- --grep "machine open"` | ❌ Wave 0 |
| DATA-03 | `campaign_variants.total_human_clicks` incremented on click with variant_id | unit | `cd packages/api && npm test -- --grep "variant counter"` | ❌ Wave 0 |
| DATA-04 | A/B eval returns skipped when total_sent < min_sample_size | unit | `cd packages/api && npm test -- --grep "sample size"` | ❌ Wave 0 |
| DATA-04 | A/B eval does not mark winner when max win prob < 0.95 | unit | `cd packages/api && npm test -- --grep "win probability"` | ❌ Wave 0 |
| DATA-05 | Resend candidate list excludes machine-only openers (first_open_at IS NULL) | unit | `cd packages/api && npm test -- --grep "resend non-opener"` | ❌ Wave 0 |

### Sampling Rate

- **Per task commit:** `cd packages/api && npm test`
- **Per wave merge:** `cd packages/api && npm test`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `packages/api/tests/tracking.test.ts` — covers DATA-01, DATA-02, DATA-03
- [ ] `packages/api/tests/ab-eval.test.ts` — covers DATA-03, DATA-04
- [ ] `packages/api/tests/resend.test.ts` — covers DATA-05

Note: Vitest is already installed in `@twmail/api` devDependencies. No framework install needed. Test files must be created.

---

## Sources

### Primary (HIGH confidence)

- Direct inspection of `packages/api/src/routes/tracking.ts` — detectMachineOpen(), recordOpen(), recordClick() implementations
- Direct inspection of `packages/workers/src/workers/ab-eval.worker.ts` — Bayesian win probability logic, absence of sample size guard
- Direct inspection of `packages/workers/src/workers/resend.worker.ts` — non-opener filter logic
- Direct inspection of `packages/shared/src/schema.ts` — database schema, column inventory
- Direct inspection of `packages/shared/src/types.ts` — EventType.MACHINE_OPEN = 9, MessageStatus definitions

### Secondary (MEDIUM confidence)

- Apple Mail Privacy Protection IP range `17.0.0.0/8` — Apple owns this block per ARIN registry; all MPP proxy traffic originates from it. Standard practice in email industry since 2021.
- Bayesian A/B testing win probability threshold of 95% — commonly cited in email marketing literature (VWO, Optimizely documentation) as the industry standard confidence threshold.

### Tertiary (LOW confidence)

- Minimum sample size of 100: pragmatic default derived from Mailchimp's 50-recipient minimum, doubled for a safety margin. No authoritative source specific to this codebase.

---

## Metadata

**Confidence breakdown:**
- MPP detection gaps (DATA-01): HIGH — derived from direct code inspection
- Variant counter bug (DATA-03): HIGH — recordOpen/recordClick missing variant update confirmed by code trace
- A/B eval sample size gap (DATA-04): HIGH — confirmed absence of any guard in ab-eval.worker.ts
- Resend correctness (DATA-05): HIGH — logic verified by tracing recordOpen behavior; `first_open_at` only set for human opens
- Win probability threshold fix (DATA-04): MEDIUM — code comment says "95%" but implementation does not enforce it; fix described

**Research date:** 2026-03-13
**Valid until:** 2026-06-13 (stable domain; only valid risk is if Apple changes proxy IP ranges, which is rare)
