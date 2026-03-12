# Phase 2: Compliance - Research

**Researched:** 2026-03-13
**Domain:** Email marketing compliance — SNS bounce/complaint handling, RFC 8058 unsubscribe, CAN-SPAM physical address, import suppression protection
**Confidence:** HIGH (full codebase audit performed; findings are code-level, not speculative)

## Summary

Phase 2 is a surgical remediation of six distinct compliance gaps across four files. The codebase already has the skeleton for all compliance features — SNS handler, RFC 8058 headers, unsubscribe endpoint, import worker — but each has a specific defect that prevents it from meeting its legal requirement. No new architectural patterns are needed; the work is targeted fixes within existing code plus one database migration and one settings schema extension.

The most critical gap is COMP-01: the SNS handler extracts a `feedbackId` for idempotency but never uses it — duplicate SNS deliveries produce duplicate suppression events. The second critical gap is COMP-06: the `settings` table has no `physical_address` column and the campaign send path performs no address check. Every other requirement is partially implemented but broken in a specific, identifiable way.

**Primary recommendation:** Fix each requirement as a targeted code change. Do not refactor the compliance layer wholesale — the existing structure is sound, only specific logic paths are missing.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| COMP-01 | SNS bounce/complaint handler is idempotent (handles duplicate SNS deliveries) | `feedbackId` is extracted but never used as a dedup key; fix: insert into `events` with `ON CONFLICT DO NOTHING` on a unique index on `(message_id, event_type, feedback_id)` or check existence before insert |
| COMP-02 | Hard bounces immediately suppress contact and prevent future sends | Status update exists; bulk-send worker checks `status = ACTIVE` at execution time, which prevents future sends. Gap: import worker must not re-activate bounced contacts (see COMP-07) |
| COMP-03 | Complaints immediately suppress contact and prevent future sends | Same pattern as COMP-02 — status update exists, bulk-send re-checks. Same import gap |
| COMP-04 | RFC 8058 List-Unsubscribe and List-Unsubscribe-Post headers on every outbound email | `getUnsubscribeHeaders()` produces correct headers; bulk-send calls it. Verified complete. Minor gap: only HTTP form, no mailto fallback (mailto is optional per RFC 8058 when HTTP form is present) |
| COMP-05 | Unsubscribe endpoint handles server-to-server POST without session/CSRF requirements | `trackingRoutes` registered outside auth scope; POST `/t/u/:messageId` requires no token. Verified complete — no changes needed |
| COMP-06 | Physical mailing address enforced at send layer, not just template layer | `settings` table has no `physical_address` column; `sendCampaign()` validation does not check for address; campaigns table has no address field. Requires: migration, settings schema update, Kysely type update, send-layer validation |
| COMP-07 | Import flow does not overwrite bounced/unsubscribed/complained contact status | Import worker does not write `status` from CSV (correct). BUT for existing contacts, the worker queries only `id` and `custom_fields` — it does NOT read current status. The `updateExisting` path at line 93-109 updates all non-email fields from the contact object; since `status` is not in `STANDARD_FIELDS`, it cannot come from CSV. Status is safe. Gap: import worker must explicitly SKIP (not silently succeed) when `updateExisting=true` and contact is suppressed |
| COMP-08 | Unsubscribed contacts excluded from pending/scheduled sends at query time | Campaign-send worker queries `WHERE status = ACTIVE`. Unsubscribed/bounced/complained contacts excluded. Bulk-send worker also re-checks at job execution time. Verified complete for new sends. Gap: SCHEDULED campaigns need the same filter when they fire — the scheduler dispatches to campaign-send which already filters correctly |
</phase_requirements>

## Standard Stack

### Core (already installed — no new deps needed)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Kysely | (existing) | Type-safe query builder for PostgreSQL | Already used throughout; all DB changes use Kysely queries |
| BullMQ | (existing) | Job queue | Import worker runs on BullMQ |
| Fastify | (existing) | HTTP framework | All route changes are Fastify handlers |
| @twmail/shared | (internal) | Schema, types, enums | All new constants go here |

### No new dependencies required
All compliance fixes are logic changes within existing infrastructure. The only external surface is the AWS SNS notification format, which is already handled.

## Architecture Patterns

### Recommended Project Structure
No new directories needed. Changes are contained to:
```
packages/
├── api/src/
│   ├── routes/webhooks-inbound.ts   # COMP-01: SNS idempotency
│   ├── services/campaigns.service.ts # COMP-06: address validation at send
│   └── services/settings.service.ts  # COMP-06: expose physical_address
├── workers/src/workers/
│   └── import.worker.ts             # COMP-07: skip suppressed contacts
├── shared/src/
│   └── schema.ts                    # COMP-06: add physical_address to SettingsTable
db/migrations/
└── 005_physical_address.sql         # COMP-06: ALTER TABLE settings
```

### Pattern 1: SNS Idempotency via Database Unique Constraint (COMP-01)

**What:** Before inserting a bounce or complaint event, check whether an event with the same `(message_id, event_type)` combination already exists. Use `ON CONFLICT DO NOTHING` or a pre-insert SELECT.

**The bug:** The `feedbackId` variable is extracted at line 178-182 of `webhooks-inbound.ts` but is never passed to any query. Duplicate SNS deliveries create duplicate rows in `events` and trigger duplicate `contacts` status updates (which is idempotent for the UPDATE, but the event INSERT is not).

**Fix approach — preferred (atomic):**
```typescript
// In processNotification(), before inserting the bounce/complaint event:
// Add a unique index in migration: CREATE UNIQUE INDEX ON events (message_id, event_type)
// WHERE event_type IN (5, 7); -- hard_bounce=5, complaint=7
// Then use ON CONFLICT DO NOTHING:

await db
  .insertInto('events')
  .values({ ... })
  .onConflict((oc) => oc.columns(['message_id', 'event_type']).doNothing())
  .execute();
```

**Alternative (pre-check):** SELECT existing event first; if found, return early. Less preferred because it's two queries and has a TOCTOU window (acceptable for SNS which is eventually-consistent anyway, but the unique constraint is cleaner).

**Why unique index on `(message_id, event_type)` for bounces/complaints only:** A single message can have exactly one hard bounce and one complaint. It cannot have two DELIVERED events for the same message (SNS delivers only once per outcome). The partial index keeps the constraint tight without breaking OPEN, CLICK, SENT events which can have multiples.

**Contact status UPDATE is already idempotent** — `UPDATE contacts SET status = 3 WHERE id = X` is safe to run twice. Only the event INSERT needs dedup.

### Pattern 2: Import Suppression Guard (COMP-07)

**What:** When `updateExisting=true` and the contact already exists, read the current `status` and skip the update if the contact is suppressed.

**The bug:** The import worker (line 75-79) only selects `id` and `custom_fields` from the existing contact. It never reads `status`. It then updates the contact's fields. While `status` cannot come from CSV (it's not in STANDARD_FIELDS), the more important protection is that `updateExisting=true` imports should not even touch suppressed contacts at all — to avoid accidentally adding them to new lists or resetting engagement timestamps.

**Fix:**
```typescript
// Change the select to also fetch status:
const existing = await db
  .selectFrom('contacts')
  .select(['id', 'status', 'custom_fields'])
  .where('email', '=', email)
  .executeTakeFirst();

if (existing) {
  // COMP-07: Never re-subscribe suppressed contacts
  const suppressedStatuses = [
    ContactStatus.BOUNCED,
    ContactStatus.COMPLAINED,
    ContactStatus.UNSUBSCRIBED,
  ];
  if (suppressedStatuses.includes(existing.status as any)) {
    skipped++;
    continue;
  }
  // ... rest of update logic
}
```

### Pattern 3: Physical Address Enforcement (COMP-06)

**What:** Add `physical_address` to the `settings` table. Add a validation check in `sendCampaign()` that reads settings and rejects the send if `physical_address` is empty.

**Migration:**
```sql
-- 005_physical_address.sql
ALTER TABLE settings ADD COLUMN physical_address TEXT NOT NULL DEFAULT '';
```

**Kysely schema update** (`packages/shared/src/schema.ts`):
```typescript
export interface SettingsTable {
  // ... existing fields
  physical_address: Generated<string>; // empty string default
}
```

**Send-layer validation** (`campaigns.service.ts`, `sendCampaign()`):
```typescript
// After existing validations, before updating status to SENDING:
const db = getDb();
const settings = await db.selectFrom('settings').select('physical_address').where('id', '=', 1).executeTakeFirst();
if (!settings?.physical_address?.trim()) {
  throw new AppError(400, ErrorCode.VALIDATION_ERROR, 'A physical mailing address must be configured in settings before sending');
}
```

**Why at the send layer, not template layer:** Templates can be swapped, edited, or reused. The physical address requirement (CAN-SPAM, CASL) is per-send, not per-template. Enforcing at template time would be bypassable by switching templates at send time.

### Pattern 4: RFC 8058 Header Verification (COMP-04)

**Current state (VERIFIED COMPLETE):**
- `getUnsubscribeHeaders(messageId)` in `packages/workers/src/tracking.ts` returns:
  ```
  List-Unsubscribe: <https://mail.thirdwavebbq.com.au/t/u/{messageId}>
  List-Unsubscribe-Post: List-Unsubscribe=One-Click
  ```
- `bulk-send.worker.ts` calls `getUnsubscribeHeaders(messageId)` and passes result to `sendEmail()`
- RFC 8058 Section 3.1 requires: `List-Unsubscribe` with HTTPS URL + `List-Unsubscribe-Post: List-Unsubscribe=One-Click`
- Both headers are present and correct

**No code changes needed for COMP-04.** The planner should verify this in the plan's acceptance criteria rather than building it.

**Note on mailto fallback:** RFC 8058 allows mailto: as an alternative or alongside HTTPS. It is NOT required when HTTPS is present. Gmail, Apple Mail, and other major clients support the HTTP-only form. No mailto fallback is needed.

### Pattern 5: Unsubscribe POST Authentication (COMP-05)

**Current state (VERIFIED COMPLETE):**
- `trackingRoutes` is registered at app root level (line 59 of `app.ts`): `await app.register(trackingRoutes)`
- All other routes are registered with auth-requiring prefix handlers
- The `authPlugin` decorates `app.authenticate` but does NOT add it as a global preHandler
- `trackingRoutes` handlers have no `preHandler: [app.authenticate]`
- POST `/t/u/:messageId` is unauthenticated by design

**No code changes needed for COMP-05.** The planner should document this as a verification task.

### Anti-Patterns to Avoid

- **Don't add CSRF tokens to the unsubscribe endpoint:** RFC 8058 explicitly requires POST to work without session/CSRF. Adding tokens would break one-click unsubscribe in Gmail, Apple Mail, etc.
- **Don't check feedbackId from SNS as a primary dedup key:** feedbackId is sometimes null (soft bounces, some SES configurations). Use `(message_id, event_type)` unique constraint instead.
- **Don't store physical_address on the campaign:** It changes, and old campaigns should still show the address that was valid when they sent. The settings singleton is the right source; validate at send time but don't copy it into the campaign record.
- **Don't reactivate suppressed contacts on import:** Even if the CSV has `status=active`, this must be ignored. The suppression list is authoritative over import data.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| SNS dedup | Custom in-memory cache or Redis dedup set | PostgreSQL unique index + `ON CONFLICT DO NOTHING` | Survives restarts, atomic, no additional infrastructure |
| Address validation | Regex or third-party API | Non-empty string check | CAN-SPAM requires a physical address be present, not that it be validated — that's the sender's responsibility |
| Unsubscribe token verification | Signed JWT in unsubscribe URL | None — message UUID is sufficient | The message UUID is unguessable (UUID v4); signing adds complexity with no security benefit since unsubscribing is a safe, desired action |

**Key insight:** All compliance requirements are DB constraints and application-layer guards. No new services, queues, or external integrations are needed.

## Common Pitfalls

### Pitfall 1: Partial Unique Index Scope Too Narrow
**What goes wrong:** If the unique index on events only covers `(message_id, event_type)` without considering that message_id can be NULL for some events, PostgreSQL treats NULLs as distinct — so `NULL, 5` and `NULL, 5` are not considered duplicates.
**Why it happens:** SNS events without a matching message in the `messages` table return early before insertion. But it's worth confirming message_id is always set for bounce/complaint events.
**How to avoid:** The `processNotification` function returns early if `!message` — so message_id will always be a real UUID when we reach the insert. The index is safe. Document this assumption.

### Pitfall 2: Import Worker's `updateExisting` Default is `true`
**What goes wrong:** The `enqueueImport` function defaults `updateExisting ?? true`. An import with no explicit `updateExisting: false` will try to update existing contacts including suppressed ones.
**Why it happens:** The default was chosen for convenience but conflicts with compliance requirements.
**How to avoid:** The suppression guard in the import worker must run regardless of `updateExisting` value — suppressed contacts should never be updated or re-listed.

### Pitfall 3: Duplicate SNS Delivery Window
**What goes wrong:** SNS guarantees at-least-once delivery. Between when SNS sends a notification and when our handler processes it, a second delivery can arrive. If both are processed concurrently, both may pass an existence check and both insert events.
**Why it happens:** Two worker processes handling the same SNS message simultaneously.
**How to avoid:** Use the database unique constraint (not an application-level check) as the dedup mechanism. The unique constraint is enforced at the database level under concurrency. The losing INSERT is silently ignored via `ON CONFLICT DO NOTHING`.

### Pitfall 4: Settings Migration Must Be Backward Compatible
**What goes wrong:** Adding `physical_address NOT NULL` without a default fails for existing rows.
**Why it happens:** PostgreSQL won't add a NOT NULL column without a default if existing rows exist.
**How to avoid:** Use `NOT NULL DEFAULT ''` in the ALTER TABLE statement. The application validation then treats empty string as "not configured."

### Pitfall 5: Campaign-Send Worker Queues Before Suppression Check
**What goes wrong:** The `createCampaignSendWorker` enqueues all `ContactStatus.ACTIVE` contacts at the time of queue build. If a contact unsubscribes after the job is queued but before the `createBulkSendWorker` processes their individual job, they'd still receive the email.
**Why it happens:** The contacts are resolved once at campaign dispatch time, then individual jobs are processed later.
**How to avoid:** The `createBulkSendWorker` already re-checks `WHERE status = ACTIVE` at individual job execution time (lines 41-48 of `bulk-send.worker.ts`). This is correct and sufficient. No change needed.

## Code Examples

### SNS Idempotency Migration
```sql
-- db/migrations/005_physical_address.sql
-- COMP-06: Add physical mailing address to settings
ALTER TABLE settings ADD COLUMN physical_address TEXT NOT NULL DEFAULT '';

-- COMP-01: Unique index for SNS bounce/complaint dedup
-- Hard bounce = event_type 5, Complaint = event_type 7
-- A message can only hard-bounce or be complained about once
CREATE UNIQUE INDEX idx_events_dedup_bounce_complaint
  ON events (message_id, event_type)
  WHERE event_type IN (5, 7) AND message_id IS NOT NULL;
```

### SNS Handler Idempotent Insert
```typescript
// In webhooks-inbound.ts, case 'Bounce' for hard bounce:
// Replace:
//   db.insertInto('events').values({...}).execute()
// With:
await db
  .insertInto('events')
  .values({ event_type: eventType, ... })
  .onConflict((oc) =>
    oc.columns(['message_id', 'event_type']).doNothing()
  )
  .execute();
// The contact status UPDATE is already idempotent — no change needed there
```

### Import Worker Suppression Guard
```typescript
// import.worker.ts — in the existing contact branch
const existing = await db
  .selectFrom('contacts')
  .select(['id', 'status', 'custom_fields'])  // add 'status'
  .where('email', '=', email)
  .executeTakeFirst();

if (existing) {
  // COMP-07: Suppressed contacts cannot be re-subscribed via import
  const isSuppressed = (
    existing.status === ContactStatus.BOUNCED ||
    existing.status === ContactStatus.COMPLAINED ||
    existing.status === ContactStatus.UNSUBSCRIBED
  );
  if (isSuppressed) {
    skipped++;
    continue;
  }
  // ... rest of existing update logic unchanged
}
```

### Campaign Send Validation with Address Check
```typescript
// campaigns.service.ts — sendCampaign(), after existing subject/content/target checks:
const settings = await db
  .selectFrom('settings')
  .select('physical_address')
  .where('id', '=', 1)
  .executeTakeFirst();

if (!settings?.physical_address?.trim()) {
  throw new AppError(
    400,
    ErrorCode.VALIDATION_ERROR,
    'A physical mailing address must be configured in Settings before sending campaigns'
  );
}
```

## State of the Art

| Old Approach | Current Approach | Impact |
|--------------|------------------|--------|
| One-click unsubscribe via redirect GET | RFC 8058 POST-based one-click | Gmail/Apple show native "Unsubscribe" button; reduces spam complaints |
| CAN-SPAM physical address in template footer | Enforced at send layer in settings | Cannot be bypassed by template changes |
| Trust SNS delivers once | Unique constraint guards against duplicate events | Idempotent under at-least-once delivery |

**Relevant law context (HIGH confidence from public sources):**
- **CAN-SPAM Act (US):** Requires physical postal address in commercial email. No validator — presence required.
- **CASL (Canada):** Requires a physical mailing address in commercial electronic messages.
- **RFC 8058:** Defines `List-Unsubscribe-Post: List-Unsubscribe=One-Click` header. HTTP POST must work without auth per spec Section 3.2 ("The List-Unsubscribe-Post request MUST NOT require authentication").
- **AWS SES / SNS:** SNS delivers with at-least-once semantics; duplicate notifications are documented behavior.

## Open Questions

1. **feedbackId usage for soft bounces**
   - What we know: The SNS handler extracts `feedbackId` for bounces but the unique index approach on `(message_id, event_type)` covers hard bounces (event_type 5). Soft bounces (event_type 6) are NOT suppressed — a contact can soft bounce multiple times for different campaigns.
   - What's unclear: Should soft bounce events also be deduplicated per SNS delivery? The concern is a single soft bounce notification being processed twice for the same message.
   - Recommendation: Yes, include event_type 6 in the partial unique index. A single message delivery either soft-bounced or it didn't — there's no valid reason to have two soft-bounce events for the same message.

2. **COMP-08 — Scheduled campaign contact re-evaluation**
   - What we know: When a scheduled campaign fires, `createCampaignSendWorker` queries contacts with `status = ACTIVE` at that moment. Contacts who unsubscribed between scheduling and send time are automatically excluded.
   - What's unclear: Is there any path where contact IDs are captured at schedule time and stored, bypassing the re-query? Reviewing `scheduler.ts` would confirm.
   - Recommendation: Plan should verify `scheduler.ts` dispatches to `campaign-send` queue (which re-queries contacts) rather than pre-resolving contact IDs.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest (configured in existing packages) |
| Config file | See `packages/api/package.json` vitest config |
| Quick run command | `npm run test --workspace=packages/api -- --reporter=verbose --run` |
| Full suite command | `npm run test --workspace=packages/api` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| COMP-01 | Duplicate SNS bounce notification produces exactly one event row | unit | `vitest run tests/sns-idempotency.test.ts` | Wave 0 |
| COMP-01 | Duplicate SNS complaint notification produces exactly one event row | unit | `vitest run tests/sns-idempotency.test.ts` | Wave 0 |
| COMP-02 | Hard-bounced contact (status=3) is not selected by campaign-send worker | unit | `vitest run tests/compliance.test.ts` | Wave 0 |
| COMP-03 | Complained contact (status=4) is not selected by campaign-send worker | unit | `vitest run tests/compliance.test.ts` | Wave 0 |
| COMP-04 | Bulk-send produces emails with List-Unsubscribe and List-Unsubscribe-Post headers | unit | `vitest run tests/compliance.test.ts` | Wave 0 |
| COMP-05 | POST /t/u/:id returns 200 with no Authorization header | integration | `vitest run tests/unsubscribe.test.ts` | Wave 0 |
| COMP-06 | sendCampaign() throws validation error when settings.physical_address is empty | unit | `vitest run tests/compliance.test.ts` | Wave 0 |
| COMP-07 | Import of CSV containing bounced contact email leaves contact status unchanged | unit | `vitest run tests/import-compliance.test.ts` | Wave 0 |
| COMP-07 | Import of CSV containing complained contact email skips that contact | unit | `vitest run tests/import-compliance.test.ts` | Wave 0 |
| COMP-08 | Campaign-send worker query excludes status=2,3,4 contacts | unit | `vitest run tests/compliance.test.ts` | Wave 0 |

### Sampling Rate
- **Per task commit:** `npm run test --workspace=packages/api -- --run --reporter=dot`
- **Per wave merge:** Full suite across all packages
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `packages/api/tests/sns-idempotency.test.ts` — covers COMP-01
- [ ] `packages/api/tests/compliance.test.ts` — covers COMP-02, COMP-03, COMP-04, COMP-06, COMP-08
- [ ] `packages/api/tests/unsubscribe.test.ts` — covers COMP-05
- [ ] `packages/workers/tests/import-compliance.test.ts` — covers COMP-07

## Sources

### Primary (HIGH confidence)
- Direct codebase audit — `packages/api/src/routes/webhooks-inbound.ts` (full read, 286 lines)
- Direct codebase audit — `packages/api/src/routes/tracking.ts` (full read, 301 lines)
- Direct codebase audit — `packages/workers/src/workers/import.worker.ts` (full read, 193 lines)
- Direct codebase audit — `packages/workers/src/workers/bulk-send.worker.ts` (full read, 400 lines)
- Direct codebase audit — `packages/workers/src/tracking.ts` (full read, 55 lines)
- Direct codebase audit — `packages/api/src/app.ts` — confirms trackingRoutes registration without auth
- Direct codebase audit — `packages/api/src/plugins/auth.ts` — confirms auth is opt-in per route
- Direct codebase audit — `packages/api/src/services/campaigns.service.ts` — confirms no physical address check
- Direct codebase audit — `db/migrations/002_settings_table.sql` — confirms no physical_address column
- Direct codebase audit — `packages/shared/src/schema.ts` — confirms SettingsTable structure

### Secondary (MEDIUM confidence)
- RFC 8058 (One-Click Unsubscribe) — well-established standard, Section 3.2 explicitly prohibits auth requirements on the POST endpoint
- CAN-SPAM Act physical address requirement — well-established law, "valid physical postal address" required
- AWS SNS documentation — at-least-once delivery is documented behavior

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new deps; all changes in existing code
- Architecture: HIGH — code-level findings with exact file/line references
- Pitfalls: HIGH — identified from actual code paths, not speculation
- What's complete (no work needed): COMP-04, COMP-05 — verified by code trace
- What needs work: COMP-01, COMP-02/03 (import gap via COMP-07), COMP-06, COMP-07, COMP-08 (verify scheduler)

**Research date:** 2026-03-13
**Valid until:** Until codebase changes — research is based on exact file content, not external APIs
