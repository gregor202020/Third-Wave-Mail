# Phase 4: Data Integrity — Error Handling - Research

**Researched:** 2026-03-13
**Domain:** Node.js/TypeScript error handling in BullMQ workers and async Fastify routes
**Confidence:** HIGH

## Summary

Phase 4 addresses two requirements: DATA-06 (replace silent `.catch(() => {})` with proper error logging) and DATA-07 (keep campaign counters accurate after any error during bulk send). Both are pure code changes — no new dependencies required. The codebase already uses Fastify's built-in Pino logger (via `app.log`) in the API layer, but workers have no logger at all — they use bare `console.error`. The fix is consistent: add context-rich logging to every swallowed error site.

The counter accuracy problem (DATA-07) is a consequence of the BullMQ job failure model. When a `bulk-send` job throws, BullMQ marks it failed and the Lua-script decrement never runs — the Redis counter stays stuck and `campaigns.total_sent` is never incremented. The campaign completion signal (`shouldComplete === 1`) never fires, so the campaign stays in SENDING forever. The fix is to use BullMQ's `worker.on('failed', ...)` event (already wired) or a `try/finally` block inside the job processor to always decrement the Redis counter, even on error, and to increment `total_failed` (or equivalent) in the DB.

**Primary recommendation:** Audit all five `.catch(() => {})` sites and replace them with contextual logging; add a `try/finally` in the `bulk-send` job processor that always decrements the Redis counter and always updates either `total_sent` or a `total_failed` counter.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| DATA-06 | All `.catch(() => {})` replaced with proper error logging | Five concrete sites identified by code audit; logging pattern confirmed from existing worker `.on('failed')` handlers |
| DATA-07 | Campaign counters accurate — no silent drift from swallowed errors | Counter drift root cause identified: job throw exits before Lua decrement; fix is `try/finally` always-decrement pattern |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Pino (via Fastify) | built-in | Structured logging in API layer | Already present; `app.log.error(...)` available in route handlers |
| `console.error` | Node built-in | Logging in workers | Workers have no Pino instance; consistent with existing `worker.on('failed')` handlers — acceptable for now (Phase 11 adds full Pino) |
| BullMQ Worker events | ^5.25.0 | Job-level failure hooks | `worker.on('failed', (job, err) => ...)` already present in every worker |

### No New Dependencies
This phase requires zero new packages. All needed primitives exist:
- API routes: `request.log` (Fastify/Pino, available in route scope) or `app.log` (available in plugin scope)
- Workers: `console.error` (already the pattern in every `.on('failed')` handler)

## Architecture Patterns

### The Five Silent `.catch(() => {})` Sites

Identified by code search (`grep -r '.catch(() => {})'`):

| File | Line | Site | Context | Correct Fix |
|------|------|------|---------|-------------|
| `packages/api/src/services/segments.service.ts` | 143 | Cache write after `getSegmentContacts()` | Fire-and-forget cache update | Log with `console.warn` + segmentId |
| `packages/api/src/services/segments.service.ts` | 216 | Cache write after `getSegmentCount()` | Fire-and-forget cache update | Log with `console.warn` + segmentId |
| `packages/api/src/routes/tracking.ts` | 43 | `recordOpen(...)` in open-pixel handler | Fire-and-forget tracking | Log with `request.log.error` + messageId |
| `packages/api/src/routes/tracking.ts` | 98 | `recordClick(...)` in click redirect handler | Fire-and-forget tracking | Log with `request.log.error` + messageId |
| `packages/api/src/plugins/auth.ts` | 136 | `last_used_at` update for API key | Fire-and-forget housekeeping | Log with `console.warn` + key prefix |

**Important distinction:** These sites are intentionally fire-and-forget — the caller must not `await` them (that would block pixel response / redirect). The fix is to replace the empty callback with one that logs, NOT to add `await`.

### Pattern 1: Fire-and-Forget With Logging (Tracking Routes)

**What:** Replace `.catch(() => {})` with `.catch((err) => request.log.error({ err, messageId }, 'recordOpen failed'))`.
**When to use:** Inside Fastify route handlers where `request.log` is in scope.

```typescript
// BEFORE
recordOpen(db, messageId, request).catch(() => {});

// AFTER
recordOpen(db, messageId, request).catch((err) => {
  request.log.error({ err, messageId }, 'recordOpen failed');
});
```

**Source:** Fastify docs — `request.log` is a child Pino logger with request metadata automatically attached.

### Pattern 2: Fire-and-Forget With Logging (Service Layer)

**What:** Replace `.catch(() => {})` with `.catch((err) => console.warn(...))` in service functions that have no Fastify context.
**When to use:** In `services/*.ts` where no `request` object exists.

```typescript
// BEFORE
db.updateTable('segments')
  .set({ cached_count: total, cached_at: new Date() })
  .where('id', '=', segmentId)
  .execute()
  .catch(() => {});

// AFTER
db.updateTable('segments')
  .set({ cached_count: total, cached_at: new Date() })
  .where('id', '=', segmentId)
  .execute()
  .catch((err) => {
    console.warn({ err, segmentId }, 'Failed to update segment cache');
  });
```

**Note:** Use `warn` not `error` — cache write failure is non-critical (stale count is fine).

### Pattern 3: Campaign Counter Accuracy (DATA-07)

**Root cause of drift:** In `bulk-send.worker.ts`, the job processor function throws on any error (SES failure, DB failure, etc.). BullMQ catches the throw, marks the job failed, and the `worker.on('failed')` event fires — but the Lua decrement script and `total_sent` increment are never reached. The Redis counter stays elevated; the campaign never transitions to SENT.

**Fix — try/finally always-decrement:**

```typescript
// In createBulkSendWorker job processor
async (job: Job<BulkSendJobData>) => {
  const { contactId, campaignId } = job.data;
  let shouldDecrementOnError = false;

  try {
    // ... existing contact fetch, campaign fetch, skip checks ...

    // Once we have a message record, we MUST decrement on success OR failure
    shouldDecrementOnError = true;

    // ... SES send ...

    // Increment sent counter
    await db.updateTable('campaigns')
      .set((eb) => ({ total_sent: eb('total_sent', '+', 1) }))
      .where('id', '=', campaignId)
      .execute();

    // Decrement and check completion (existing Lua)
    const shouldComplete = await redis.eval(
      DECR_AND_CHECK_LUA, 1, `twmail:remaining:${campaignId}`
    ) as number;

    // ... completion logic ...
    shouldDecrementOnError = false; // success path, decrement already ran
    return { sent: true, messageId, sesMessageId };

  } finally {
    if (shouldDecrementOnError) {
      // Job threw — still decrement so campaign can complete
      // Increment total_failed so counters remain accurate
      try {
        await redis.eval(DECR_AND_CHECK_LUA, 1, `twmail:remaining:${campaignId}`);
        await db.updateTable('campaigns')
          .set((eb) => ({ total_failed: eb('total_failed', '+', 1) }))
          .where('id', '=', campaignId)
          .execute();
      } catch (finallyErr) {
        console.error({ finallyErr, campaignId, contactId }, 'Failed to decrement counter in finally block');
      }
    }
  }
}
```

**Alternative approach (simpler if schema lacks `total_failed`):** Check whether `campaigns` table has a `total_failed` column. If not, the counter fix only needs to ensure the Lua decrement always runs — so the campaign completes. The `total_sent` accuracy is handled by only incrementing after confirmed SES send. The `.on('failed')` handler is the right place for the Lua decrement call when no `finally` block is used.

### Pattern 4: Using BullMQ `worker.on('failed')` for Counter Cleanup

```typescript
// Alternative: decrement counter in failed event handler
worker.on('failed', async (job, err) => {
  if (!job) return;
  const { campaignId, contactId } = job.data;
  console.error({ err: err.message, campaignId, contactId }, `Bulk send job ${job.id} failed`);

  // Ensure Redis counter is decremented so campaign can complete
  try {
    await redis.eval(DECR_AND_CHECK_LUA, 1, `twmail:remaining:${campaignId}`);
  } catch (redisErr) {
    console.error({ redisErr, campaignId }, 'Failed to decrement Redis counter after job failure');
  }
});
```

**Trade-off:** The `.on('failed')` handler approach is simpler but runs after BullMQ's internal retry logic — if the job has retries configured, the handler fires on every failed attempt, not just the final one. Check BullMQ retry config before choosing this approach. If `attempts > 1` in the job options, decrement must only happen on the **final** failure (check `job.attemptsMade === job.opts.attempts`).

Currently `bulk-send` worker has **no retry config**, so BullMQ defaults to 0 retries (job fails immediately). The `worker.on('failed')` approach is safe for now.

### Schema Check — Does `total_failed` Exist?

```typescript
// From packages/shared/src/schema.ts (campaigns table)
total_sent: Generated<number>;   // confirmed present
total_bounces: Generated<number>; // confirmed present
// total_failed: NOT present in schema
```

The `campaigns` table has `total_sent` and `total_bounces` but no `total_failed` column. DATA-07 says "campaign counters remain accurate" — the key counter is `total_sent`. Accurate means: `total_sent` only increments when SES confirms the send. Jobs that fail before or during SES should NOT increment `total_sent`. The fix ensures the Lua counter always decrements so completion fires correctly, even if `total_sent` is lower than expected.

If a `total_failed` column is desirable for reporting, it requires a schema migration. Given phase scope (DATA-06 + DATA-07 only), recommend skipping the migration and documenting the counter semantics: `total_sent` = confirmed SES sends, failed jobs are observable via BullMQ failed queue.

### Anti-Patterns to Avoid

- **Re-throwing inside fire-and-forget `.catch`:** The point is fire-and-forget; logging is correct, re-throwing breaks the response flow.
- **Adding `await` to fire-and-forget calls:** Tracking pixel must return before the DB write. Do not change the async model.
- **Decrementing the counter twice:** If a job succeeds the Lua script at line 193 already decrements. The `finally` guard (`shouldDecrementOnError`) prevents double-decrement.
- **Swallowing errors inside the `finally` block:** The `try/catch` inside `finally` must also log — don't create a new silent catch.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Structured logging | Custom logger class | Pino (via Fastify `request.log` / `app.log`) | Already present; Pino is the standard |
| Job failure tracking | Custom DB failure table | BullMQ failed job store + `worker.on('failed')` | BullMQ retains failed jobs with full error stack |
| Atomic counter decrement | Hand-written Redis MULTI/EXEC | Existing `DECR_AND_CHECK_LUA` Lua script | Already implemented correctly for BUG-04 |

## Common Pitfalls

### Pitfall 1: Double-Decrement on Success Path
**What goes wrong:** If the `finally` block runs unconditionally, a successful job decrements twice (once at line 193, once in `finally`), leaving the counter negative and the completion check broken.
**Why it happens:** `try/finally` always runs `finally`.
**How to avoid:** Use a boolean flag (`shouldDecrementOnError`) set `true` before SES send and `false` after the Lua decrement succeeds. Check it in `finally`.

### Pitfall 2: Missing Context in Error Logs
**What goes wrong:** `console.error(err)` logs the error but not which campaign/contact/message was involved — useless for debugging in production.
**Why it happens:** Copying the naive pattern.
**How to avoid:** Always include `{ campaignId, contactId, messageId }` in the log call.

### Pitfall 3: Changing Fire-and-Forget to Awaited
**What goes wrong:** Adding `await` to `recordOpen` blocks the pixel response — now the user's email client waits for the DB write before receiving the image, adding latency and failing if DB is slow.
**Why it happens:** Reviewers see the `.catch` and think "just await it".
**How to avoid:** Keep the fire-and-forget model; only fix the catch callback.

### Pitfall 4: Treating BullMQ `.on('failed')` as Always-Final
**What goes wrong:** If retries are later added to the `bulk-send` queue, the `.on('failed')` handler fires on every failed attempt — decrementing the counter multiple times per contact.
**Why it happens:** BullMQ fires `failed` on each attempt.
**How to avoid:** Either use `try/finally` in the processor (cleaner), or guard with `job.attemptsMade === job.opts.attempts ?? 1`.

### Pitfall 5: `total_failed` Migration Scope Creep
**What goes wrong:** Adding a `total_failed` DB column requires a migration, which adds risk and test surface beyond what DATA-07 requires.
**Why it happens:** The desire for perfect analytics.
**How to avoid:** DATA-07 only requires counters "remain accurate". The existing `total_sent` semantics (only incremented on confirmed send) already satisfy this if the Lua decrement fires correctly. Defer `total_failed` column to an analytics phase.

## Code Examples

### Verified: Existing `.on('failed')` Pattern (bulk-send.worker.ts:230)
```typescript
// Source: packages/workers/src/workers/bulk-send.worker.ts
worker.on('failed', (job, err) => {
  console.error(`Bulk send job ${job?.id} failed:`, err.message);
});
```

**Problem:** Logs the job ID and error message, but not `campaignId` or `contactId` — which is what you need to diagnose failures. Fix: add `job?.data` to the log.

### Verified: Existing Lua Decrement (bulk-send.worker.ts:10)
```typescript
// Source: packages/workers/src/workers/bulk-send.worker.ts
const DECR_AND_CHECK_LUA = `
  local key = KEYS[1]
  local current = redis.call('DECR', key)
  if current <= 0 then
    redis.call('DEL', key)
    return 1
  end
  return 0
`;
```

This Lua script is correct and already implemented. Phase 4 only needs to ensure it runs on the error path too.

### Verified: Fastify `request.log` Available in Route Handlers
```typescript
// Source: packages/api/src/routes/tracking.ts (existing pattern)
app.get('/t/o/:messageId.png', { config: { rateLimit: false } }, async (request, reply) => {
  // request.log is a Pino child logger with request context
  request.log.error({ err, messageId }, 'recordOpen failed');
});
```

## State of the Art

| Old Approach | Current Approach | Impact |
|--------------|-----------------|--------|
| `.catch(() => {})` — no-op | `.catch((err) => log.error({ err, context }, msg))` | Errors are observable without changing async model |
| BullMQ job throws, counter stuck | `try/finally` always decrements Lua counter | Campaign completes correctly even if some sends fail |

## Open Questions

1. **Should `total_failed` be added to the `campaigns` schema?**
   - What we know: Column does not exist; DATA-07 can be satisfied without it
   - What's unclear: Whether ops team wants a visible failed count in the dashboard
   - Recommendation: Defer — satisfy DATA-07 with correct Lua decrement; add column in an observability phase if needed

2. **BullMQ retry configuration for `bulk-send`**
   - What we know: Currently no `attempts` option set (defaults to 1, meaning no retry)
   - What's unclear: Whether retries will be added in Phase 9 (OPS-01 — worker crash recovery)
   - Recommendation: Use `try/finally` approach (not `worker.on('failed')`) so it is safe regardless of retry count

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest ^2.1.0 |
| Config file | none — uses package.json `"test": "vitest run"` |
| Quick run command | `cd packages/api && npm test` |
| Full suite command | `cd packages/api && npm test` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| DATA-06 | `.catch` sites log errors with context | unit | `cd packages/api && npm test -- --reporter=verbose` | ❌ Wave 0 |
| DATA-07 | Lua decrement runs even when job throws | unit | `cd packages/api && npm test -- --reporter=verbose` | ❌ Wave 0 |

**Note:** Worker logic cannot be tested via the Fastify HTTP tests in `packages/api/tests/`. A new test file is needed in `packages/workers/` OR the relevant pure functions should be extracted and tested directly (same pattern as `calculateBayesianWinProbability` exported from `ab-eval.worker.ts`).

### Sampling Rate
- **Per task commit:** `cd packages/api && npm test`
- **Per wave merge:** `cd packages/api && npm test`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `packages/api/tests/error-handling.test.ts` — covers DATA-06: verify `.catch` callbacks call a log function (mock `console.error`/`request.log.error`, trigger the error path, assert mock called with context)
- [ ] `packages/workers/tests/bulk-send-counter.test.ts` — covers DATA-07: mock Redis `eval` and DB `updateTable`, simulate job processor throw, assert Lua eval was still called (may require extracting the job processor function for unit testing)

Worker test infrastructure gap: `packages/workers` has no `vitest` dependency and no `tests/` directory. Wave 0 must either add vitest to workers OR test DATA-07 via extracted pure functions only.

## Sources

### Primary (HIGH confidence)
- Direct code audit of `packages/workers/src/workers/bulk-send.worker.ts` — full file read, all counter and error paths traced
- Direct code audit of `packages/api/src/routes/tracking.ts` — fire-and-forget patterns confirmed
- Direct code audit of `packages/api/src/services/segments.service.ts` — two cache-write catch sites confirmed
- Direct code audit of `packages/api/src/plugins/auth.ts` — `last_used_at` catch site confirmed
- `packages/shared/src/schema.ts` — confirmed `total_failed` column absent, `total_sent` present
- BullMQ Worker API — `worker.on('failed', (job, err) => ...)` — confirmed in existing worker code

### Secondary (MEDIUM confidence)
- Fastify docs convention: `request.log` is a Pino child logger available inside route handlers — consistent with `app.log.error(error)` usage in `error-handler.ts` line 73

### Tertiary (LOW confidence)
- BullMQ retry default behavior (0 retries = 1 attempt) — from training knowledge; verify against BullMQ 5.x changelog if retry behavior is critical to counter fix choice

## Metadata

**Confidence breakdown:**
- Silent catch sites: HIGH — found by direct grep + code read
- Counter drift mechanism: HIGH — traced execution path through job processor
- Fix patterns: HIGH — consistent with existing codebase patterns
- Schema facts: HIGH — read directly from schema.ts
- BullMQ retry default: MEDIUM — training knowledge, not verified against v5 docs

**Research date:** 2026-03-13
**Valid until:** 2026-04-13 (stable domain)
