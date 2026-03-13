---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: executing
stopped_at: Completed 10-email-output-10-01-PLAN.md
last_updated: "2026-03-13T03:23:06.466Z"
last_activity: 2026-03-13 — Plan 05-01 complete (click redirect SENT event link_map fix + URL preservation tests)
progress:
  total_phases: 12
  completed_phases: 9
  total_plans: 20
  completed_plans: 19
---

---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: executing
stopped_at: Completed 08-code-quality-strictness-08-01-PLAN.md
last_updated: "2026-03-13T02:00:05.631Z"
last_activity: 2026-03-13 — Plan 05-01 complete (click redirect SENT event link_map fix + URL preservation tests)
progress:
  total_phases: 12
  completed_phases: 6
  total_plans: 17
  completed_plans: 15
  percent: 91
---

---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: executing
stopped_at: Completed 05-data-integrity-tracking-segments-05-01-PLAN.md
last_updated: "2026-03-13T11:20:00.000Z"
last_activity: 2026-03-13 — Plan 05-01 complete (click redirect SENT event link_map fix + URL preservation tests)
progress:
  [█████████░] 91%
  completed_phases: 3
  total_plans: 9
  completed_plans: 9
  percent: 65
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-13)

**Core value:** Reliably send targeted email campaigns with tracking and analytics — every email must be deliverable, trackable, and the data must be accurate.
**Current focus:** Phase 2 — Compliance

## Current Position

Phase: 5 of 12 (Data Integrity - Tracking & Segments)
Plan: 1 of 2 in current phase (05-01 complete, 05-02 next)
Status: In progress
Last activity: 2026-03-13 — Plan 05-01 complete (click redirect SENT event link_map fix + URL preservation tests)

Progress: [██████░░░░] 65%

## Performance Metrics

**Velocity:**
- Total plans completed: 0
- Average duration: -
- Total execution time: 0 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| - | - | - | - |

**Recent Trend:**
- Last 5 plans: -
- Trend: -

*Updated after each plan completion*
| Phase 02-compliance P02 | 15 | 2 tasks | 1 files |
| Phase 02-compliance P01 | 173 | 2 tasks | 5 files |
| Phase 03-data-integrity-analytics P01 | 7 | 2 tasks | 2 files |
| Phase 03-data-integrity-analytics P02 | 183 | 2 tasks | 3 files |
| Phase 04-data-integrity-error-handling P02 | 2 | 1 tasks | 1 files |
| Phase 04-data-integrity-error-handling P01 | 3 | 2 tasks | 3 files |
| Phase 05-data-integrity-tracking-segments P01 | 15 | 1 task | 2 files |
| Phase 05-data-integrity-tracking-segments P02 | 5 | 2 tasks | 4 files |
| Phase 06-infrastructure-security P02 | 12 | 2 tasks | 6 files |
| Phase 06-infrastructure-security P01 | 15 | 2 tasks | 3 files |
| Phase 07-code-quality-tooling P01 | 25 | 2 tasks | 45 files |
| Phase 07-code-quality-tooling P02 | 9 | 2 tasks | 6 files |
| Phase 08-code-quality-strictness P02 | 25 | 1 tasks | 2 files |
| Phase 08-code-quality-strictness P01 | 120 | 2 tasks | 24 files |
| Phase 09-operational-readiness P01 | 268 | 2 tasks | 6 files |
| Phase 09-operational-readiness P02 | 6 | 2 tasks | 3 files |
| Phase 10-email-output P01 | 356 | 2 tasks | 4 files |

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- [02-02] Suppression guard in import worker runs before updateExisting check — suppressed contacts skipped unconditionally
- [02-02] isSuppressed continue skips both update AND list-add — no separate list-membership guard needed
- [02-02] COMP-02/03/04/05/08 verified by code trace — all already correctly implemented
- [Phase 02-compliance]: physical_address stored as NOT NULL DEFAULT '' — empty string means not configured, avoids nullable column complexity
- [Phase 02-compliance]: SNS idempotency via partial unique index + ON CONFLICT DO NOTHING with numInsertedOrUpdatedRows guard to prevent counter drift
- [Phase 03-01]: detectMachineOpen exported for direct unit testing without DB mocks
- [Phase 03-01]: MACHINE_UA_PATTERNS uses case-insensitive regex to catch variant capitalizations
- [Phase 03-01]: recordOpen unchanged — machine open path already correctly omits first_open_at (DATA-05)
- [Phase 03-02]: calculateBayesianWinProbability exported for direct unit testing without DB mocks
- [Phase 03-02]: WIN_PROBABILITY_THRESHOLD = 0.95 hardcoded; minSampleSize defaults to 100, overridable via ab_test_config
- [Phase 04-02]: shouldDecrementOnError set immediately after executeTakeFirstOrThrow - message record creation is the point of no return for Redis counter decrement
- [Phase 04-02]: Finally block does basic SENDING->SENT transition only, not resend-trigger - acceptable to skip on error completion path
- [Phase 04-02]: total_sent only increments on confirmed SES send - DATA-07 does not require failure counting
- [Phase 04-01]: Tracking route failures use request.log.error (Pino), service/plugin non-critical failures use console.warn to differentiate infrastructure errors from housekeeping
- [Phase 04-01]: Fire-and-forget model preserved in all five catch sites — no await added; pixel/redirect responses still return immediately
- [Phase 05-01]: resolveClickUrl extracted as exported pure function — accepts raw metadata (unknown), returns validated URL string; testable without DB mocks
- [Phase 05-01]: CLICK event query removed from redirect handler — SENT event link_map is the sole URL resolution path; CLICK INSERT in recordClick unchanged (write-only audit)
- [Phase 05-01]: targetUrl passed to reply.redirect() as raw string (not url.href) — prevents double-encoding of percent chars in UTM params and encoded query strings
- [Phase 05-02]: resolveSegmentContactIds placed in @twmail/shared — workers package has no api dependency; shared is importable by both packages
- [Phase 05-02]: within_days operator semantics: column >= (now - N*86400000ms), meaning contacts active within last N days
- [Phase 05-02]: between operator uses two-element array [low, high] matching existing SegmentRule.value type union
- [Phase 06-02]: CORS origin callback checks !origin first (SNS webhooks have no Origin header and must pass before allowlist check)
- [Phase 06-02]: helmet registered with contentSecurityPolicy disabled (pure API, CSP would interfere with tracking pixel)
- [Phase 06-02]: ALLOWED_ORIGINS defaults to empty string — empty means all origins blocked, safe default for production
- [Phase 06-01]: BullMQ bundles its own ioredis vendor — use as unknown as ConnectionOptions instead of as any for type-safe connection passing
- [Phase 06-01]: Redis noeviction policy chosen to guarantee BullMQ job keys are never evicted under memory pressure
- [Phase 06-01]: SES_CONFIG_SET const at module scope so env var is read once at startup; docker-compose passes SES_CONFIGURATION_SET with marketing default
- [Phase 07-code-quality-tooling]: no-misused-promises added as error alongside no-floating-promises; unsafe-* rules downgraded to warn for Phase 8
- [Phase 07-code-quality-tooling]: void operator used for process.on and setInterval async callbacks — fire-and-forget pattern preserved correctly
- [Phase 07-code-quality-tooling]: lint-staged --max-warnings=0 enforces zero warnings in staged files while allowing existing warnings in unstaged code
- [Phase 07-02]: processBounceSnsEvent uses ON CONFLICT (message_id, event_type) not (sns_message_id) — events table has no sns_message_id column; idempotency key is (message, event_type) pair
- [Phase 07-02]: Segment unit tests use Kysely DummyDriver + PostgresAdapter for compile() — no real DB connection required, SQL structure verified via string assertions
- [Phase 07-02]: shouldSkipSend refactored out of bulk-send worker to accept db as parameter for mock injection in unit tests
- [Phase 08-02]: SNS webhook errors use inline reply.send with { error: { code, message } } — no AppError throw, SNS callers ignore error bodies
- [Phase 08-02]: Error shape regression test uses source-code scan (fs.readFileSync) — no DB or HTTP required, fastest guard
- [Phase 08-02]: INVALID_SNS_SIGNATURE, INVALID_SUBSCRIBE_URL, INVALID_SNS_MESSAGE used as inline error codes in SCREAMING_SNAKE_CASE
- [Phase 08-01]: sql<SqlBool> template literals with sql.ref() for heterogeneous column comparisons — Kysely eb() operator calls reject RawBuilder as value
- [Phase 08-01]: Expression<SqlBool> as common return type for buildRuleFilter/buildSingleRule/buildJsonbRule covering both ExpressionWrapper and RawBuilder
- [Phase 08-01]: redis as unknown as ConnectionOptions established pattern for all BullMQ connections — ioredis structural compatibility without any cast
- [Phase 08-01]: Fastify plugin async functions suppress require-await per-function with eslint-disable-next-line — plugin type requires async signature
- [Phase 09-01]: enqueueWebhookDelivery creates ephemeral Queue per call and calls queue.close() after add — consistent with bulk-send resend path
- [Phase 09-01]: verifyHmacSignature returns false on length mismatch instead of throwing — timingSafeEqual requires equal-length buffers
- [Phase 09-01]: source-code scan strategy used for rate limiter and auto-disable tests — avoids Redis/DB setup while guaranteeing config thresholds
- [Phase 09-operational-readiness]: [Phase 09-02]: SENDING stall recovery re-enqueues without status change — campaign-send worker resolves via shouldSkipSend dedup
- [Phase 09-operational-readiness]: [Phase 09-02]: STALE_SENDING_THRESHOLD_MS = 600_000ms exported at module scope for testability
- [Phase 09-operational-readiness]: [Phase 09-02]: Timezone conversion uses ECMA-262 Date constructor + Zod .datetime() — no Luxon needed
- [Phase 10-email-output]: GrapesEditor.getHtml() uses runCommand('mjml-code-to-html') — returns compiled HTML not MJML XML
- [Phase 10-email-output]: assertAbsoluteUrls placed before shouldSkipSend — invalid content fails fast before dedup check
- [Phase 10-email-output]: isMjmlSource guard returns skipped result; assertAbsoluteUrls throws as hard guard for BullMQ job failure

### Pending Todos

None yet.

### Blockers/Concerns

- ~~Phase 1: Scheduled campaign trigger (BUG-05)~~ RESOLVED — scheduler.ts created
- ~~Phase 1: Resend-to-non-openers wire-up (BUG-06)~~ RESOLVED — wired in bulk-send completion path
- Phase 6: PgBouncer version must be >= 1.21 for prepared statement safety in transaction mode — verify from docker-compose.yml
- Phase 6: Bull Board is currently a placeholder container — needs scoping (config-only or full build)
- All phases: SES account sending limit may differ from the 40/sec default — verify via SES console before Phase 9

## Session Continuity

Last session: 2026-03-13T03:20:01.674Z
Stopped at: Completed 10-email-output-10-01-PLAN.md
Resume file: None
