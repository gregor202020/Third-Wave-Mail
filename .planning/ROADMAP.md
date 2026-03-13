# Roadmap: Third Wave Mail — Code Review & Ship

## Overview

Third Wave Mail is a feature-complete email marketing platform undergoing a production hardening milestone. The work is not feature development — it is a structured audit and remediation sequence that takes a functionally correct codebase from "mostly working in dev" to "safe to run in production." Phases proceed in risk-priority order: critical functional bugs and compliance gaps first (the campaign never actually sends), then data integrity and analytics correctness, then infrastructure hardening, then automated quality enforcement, then operational edge cases, then observability. Every phase delivers a verifiable capability that cannot be broken by subsequent phases.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

- [x] **Phase 1: Critical Bug Fixes** - Fix the bugs that prevent campaigns from sending or cause duplicate sends
- [x] **Phase 2: Compliance** - Ensure all bounce, complaint, unsubscribe, and import flows meet legal requirements (completed 2026-03-12)
- [x] **Phase 3: Data Integrity — Analytics** - Correct MPP machine-open detection and A/B test logic (completed 2026-03-12)
- [x] **Phase 4: Data Integrity — Error Handling** - Replace all swallowed errors with proper logging (completed 2026-03-12)
- [x] **Phase 5: Data Integrity — Tracking & Segments** - Fix click tracking, segment logic, and count accuracy (completed 2026-03-13)
- [x] **Phase 6: Infrastructure & Security** - Harden Redis, CORS, PgBouncer, BullMQ, and shutdown behavior (completed 2026-03-13)
- [x] **Phase 7: Code Quality — Tooling** - Install ESLint, Prettier, Vitest, and pre-commit hooks (completed 2026-03-13)
- [x] **Phase 8: Code Quality — Strictness** - TypeScript strict mode, consistent error shapes (completed 2026-03-13)
- [x] **Phase 9: Operational Readiness** - Campaign state recovery, rate limiting, scheduling, and webhooks (completed 2026-03-13)
- [x] **Phase 10: Email Output** - Validate MJML output and enforce absolute image URLs (completed 2026-03-13)
- [x] **Phase 11: Observability** - Sentry, structured logging with PII redaction (completed 2026-03-13)
- [x] **Phase 12: Production Launch** - SES DNS verification, uptime monitoring, deploy readiness (completed 2026-03-13)

## Phase Details

### Phase 1: Critical Bug Fixes
**Goal**: Campaigns send exactly once via the correct job queue
**Depends on**: Nothing (first phase)
**Requirements**: BUG-01, BUG-02, BUG-03, BUG-04, BUG-05, BUG-06
**Success Criteria** (what must be TRUE):
  1. Sending a campaign dispatches a job via BullMQ Queue.add() and the worker receives it
  2. A contact receives exactly one email per campaign even when the worker retries
  3. A/B holdback contact IDs survive a Redis restart (persisted in PostgreSQL)
  4. Campaign completion counter uses an atomic Lua script and never triggers prematurely on Redis restart
  5. A scheduled campaign transitions from SCHEDULED to SENDING at the correct time
**Plans:** 3 plans
Plans:
- [ ] 01-01-PLAN.md — Install BullMQ in API, replace redis.lpush with Queue.add(), create dedup/holdback migration
- [ ] 01-02-PLAN.md — Fix worker-side bugs: dedup check, atomic Lua counter, holdback persistence, resend trigger
- [ ] 01-03-PLAN.md — Build scheduled campaign trigger (polling loop in workers)

### Phase 2: Compliance
**Goal**: Every send is legally compliant and suppressed contacts stay suppressed
**Depends on**: Phase 1
**Requirements**: COMP-01, COMP-02, COMP-03, COMP-04, COMP-05, COMP-06, COMP-07, COMP-08
**Success Criteria** (what must be TRUE):
  1. Receiving the same SNS bounce or complaint notification twice produces no duplicate suppression events
  2. A contact that hard-bounced or complained cannot receive any future campaign email
  3. Every outbound email contains RFC 8058 List-Unsubscribe and List-Unsubscribe-Post headers
  4. A server-to-server POST to the unsubscribe endpoint succeeds without session or CSRF token
  5. Importing a CSV cannot re-subscribe a previously bounced, complained, or unsubscribed contact
  6. A campaign cannot be sent without a physical mailing address, regardless of template content
**Plans:** 2/2 plans complete
Plans:
- [ ] 02-01-PLAN.md — SNS bounce/complaint idempotency + physical mailing address enforcement
- [ ] 02-02-PLAN.md — Import suppression guard + verify already-complete compliance items

### Phase 3: Data Integrity — Analytics
**Goal**: Open and click metrics reflect real human engagement, not machine traffic
**Depends on**: Phase 2
**Requirements**: DATA-01, DATA-02, DATA-03, DATA-04, DATA-05
**Success Criteria** (what must be TRUE):
  1. Pixel requests from Apple Mail Proxy IP ranges are flagged as machine opens, not human opens
  2. Machine opens are retained in the database and visible as a distinct category in reporting
  3. A/B test winner selection uses only human open and click counts, not MPP-inflated totals
  4. An A/B test will not declare a winner until a statistically meaningful sample size is reached
  5. Resend-to-non-openers sends only to contacts with zero human opens (machine opens do not count as opened)
**Plans:** 2/2 plans complete
Plans:
- [ ] 03-01-PLAN.md — MPP detection enhancement + variant open/click behavior tests
- [ ] 03-02-PLAN.md — Variant counter fix + A/B eval sample size guard + win probability threshold

### Phase 4: Data Integrity — Error Handling
**Goal**: No error in the send pipeline is silently swallowed
**Depends on**: Phase 3
**Requirements**: DATA-06, DATA-07
**Success Criteria** (what must be TRUE):
  1. Every .catch() in service and worker code logs the error with context rather than discarding it
  2. Campaign sent/failed/skipped counters remain accurate after any error condition during bulk send
**Plans:** 2/2 plans complete
Plans:
- [ ] 04-01-PLAN.md — Replace silent .catch(() => {}) with contextual error logging (DATA-06)
- [ ] 04-02-PLAN.md — Add try/finally counter protection to bulk-send worker (DATA-07)

### Phase 5: Data Integrity — Tracking & Segments
**Goal**: Click tracking redirects correctly and segments produce accurate contact lists
**Depends on**: Phase 4
**Requirements**: DATA-08, DATA-09, DATA-10, DATA-11
**Success Criteria** (what must be TRUE):
  1. Clicking a tracked link with UTM parameters or encoded query strings reaches the original URL unchanged
  2. The click tracking redirect resolves the original URL from the SENT event link_map without scanning the events table
  3. A segment with mixed AND/OR rules returns the same contacts as the equivalent SQL query
  4. The contact count shown in segment preview matches the actual number of contacts a send reaches
**Plans:** 2/2 plans complete
Plans:
- [ ] 05-01-PLAN.md — Fix click redirect to query SENT event link_map (DATA-08, DATA-09)
- [ ] 05-02-PLAN.md — Add missing segment operators + fix dynamic segment send resolution (DATA-10, DATA-11)

### Phase 6: Infrastructure & Security
**Goal**: Production infrastructure is hardened against data loss, misconfiguration, and credential exposure
**Depends on**: Phase 5
**Requirements**: INFRA-01, INFRA-02, INFRA-03, INFRA-04, INFRA-05, INFRA-06, INFRA-07, INFRA-08, INFRA-09, INFRA-10
**Success Criteria** (what must be TRUE):
  1. Redis does not evict BullMQ job keys under any memory pressure (noeviction policy confirmed)
  2. The API rejects cross-origin credentialed requests from any origin not on the explicit CORS allowlist
  3. The API and all worker processes shut down cleanly on SIGTERM without dropping in-flight jobs
  4. GET /health returns 200 without authentication and confirms both database and Redis connectivity
  5. Redis job data survives a Redis restart (AOF persistence with everysec fsync enabled)
**Plans:** 2/2 plans complete
Plans:
- [ ] 06-01-PLAN.md — Redis hardening (noeviction, AOF fsync), PgBouncer docs, counter TTL, SES env var, remove type casts
- [ ] 06-02-PLAN.md — CORS allowlist, @fastify/helmet, health endpoint DB+Redis check, graceful shutdown Redis cleanup

### Phase 7: Code Quality — Tooling
**Goal**: Automated enforcement prevents the same class of bugs from re-entering the codebase
**Depends on**: Phase 6
**Requirements**: QUAL-01, QUAL-02, QUAL-03, QUAL-04, QUAL-05, QUAL-06, QUAL-07, QUAL-10
**Success Criteria** (what must be TRUE):
  1. Running eslint across the monorepo exits 0 with no-floating-promises enforced on all async handlers
  2. Running vitest produces passing tests for SNS handler idempotency, bulk-send deduplication, and segment query logic
  3. Attempting to commit code that fails lint or type checks is blocked by the pre-commit hook
  4. Prettier formatting is enforced consistently and does not conflict with ESLint rules
**Plans:** 2/2 plans complete
Plans:
- [ ] 07-01-PLAN.md — ESLint v9 flat config + Prettier + husky/lint-staged pre-commit hooks
- [ ] 07-02-PLAN.md — Vitest config + unit tests for SNS idempotency, bulk-send dedup, segment logic

### Phase 8: Code Quality — Strictness
**Goal**: TypeScript strict mode is clean and all API routes return a consistent error shape
**Depends on**: Phase 7
**Requirements**: QUAL-08, QUAL-09
**Success Criteria** (what must be TRUE):
  1. All packages compile with strict: true and no suppressed type errors in service or worker code
  2. Every API error response conforms to { error: { code, message } } — no route returns a different shape
**Plans:** 2/2 plans complete
Plans:
- [ ] 08-01-PLAN.md — Remove all as-any casts, fix compile errors, upgrade ESLint strict-type rules to error (QUAL-08)
- [ ] 08-02-PLAN.md — Fix non-conforming error sends in webhooks-inbound.ts + error shape test (QUAL-09)

### Phase 9: Operational Readiness
**Goal**: The system recovers from failures and respects operational constraints
**Depends on**: Phase 8
**Requirements**: OPS-01, OPS-02, OPS-03, OPS-06, OPS-07
**Success Criteria** (what must be TRUE):
  1. A campaign stuck in SENDING due to a worker crash transitions out of SENDING on the next scheduler cycle
  2. Bulk send worker throughput stays at or below 40 emails per second under full load
  3. A campaign scheduled in a non-UTC timezone sends at the correct local time after UTC storage and conversion
  4. Webhook HMAC signatures use a constant-time comparison that does not leak timing information
  5. A webhook endpoint that has failed 50 consecutive times is automatically disabled
**Plans:** 2/2 plans complete
Plans:
- [ ] 09-01-PLAN.md — Fix webhook queue wiring, add HMAC utility, verify rate limiter (OPS-02, OPS-06, OPS-07)
- [ ] 09-02-PLAN.md — Add SENDING stall recovery to scheduler, verify timezone conversion (OPS-01, OPS-03)

### Phase 10: Email Output
**Goal**: Every email rendered by the platform is valid HTML and contains only absolute URLs
**Depends on**: Phase 9
**Requirements**: OPS-04, OPS-05
**Success Criteria** (what must be TRUE):
  1. Every combination of GrapeJS editor blocks produces valid MJML output that renders without errors
  2. Every image src and link href in a sent email is an absolute URL (no relative paths)
**Plans:** 1/1 plans complete
Plans:
- [ ] 10-01-PLAN.md — Fix MJML compilation in editor + add absolute URL and MJML source guards in worker (OPS-04, OPS-05)

### Phase 11: Observability
**Goal**: Errors and system behavior are visible in production without exposing user PII in logs
**Depends on**: Phase 10
**Requirements**: OBS-01, OBS-02, OBS-03
**Success Criteria** (what must be TRUE):
  1. An unhandled exception in the API, any worker, or the frontend creates a Sentry event with full context
  2. Production log output is structured JSON with email addresses and JWT tokens redacted
  3. pino-pretty is absent from all production bundles and docker images
**Plans:** 2/2 plans complete
Plans:
- [ ] 11-01-PLAN.md — Sentry + Pino redact for API and workers (OBS-01, OBS-02, OBS-03)
- [ ] 11-02-PLAN.md — Sentry for Next.js frontend (OBS-01)

### Phase 12: Production Launch
**Goal**: The deployment is ready for live traffic with verified email deliverability and uptime monitoring
**Depends on**: Phase 11
**Requirements**: OBS-04, OBS-05
**Success Criteria** (what must be TRUE):
  1. SES domain has verified SPF, DKIM, and DMARC records with at minimum p=quarantine policy
  2. An external uptime monitor is watching the /health endpoint and will alert on any outage
**Plans:** 1/1 plans complete
Plans:
- TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 1 -> 2 -> 3 -> 4 -> 5 -> 6 -> 7 -> 8 -> 9 -> 10 -> 11 -> 12

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Critical Bug Fixes | 3/3 | Complete | 2026-03-13 |
| 2. Compliance | 2/2 | Complete   | 2026-03-12 |
| 3. Data Integrity — Analytics | 2/2 | Complete   | 2026-03-12 |
| 4. Data Integrity — Error Handling | 2/2 | Complete   | 2026-03-12 |
| 5. Data Integrity — Tracking & Segments | 2/2 | Complete   | 2026-03-13 |
| 6. Infrastructure & Security | 2/2 | Complete   | 2026-03-13 |
| 7. Code Quality — Tooling | 2/2 | Complete   | 2026-03-13 |
| 8. Code Quality — Strictness | 2/2 | Complete   | 2026-03-13 |
| 9. Operational Readiness | 2/2 | Complete   | 2026-03-13 |
| 10. Email Output | 1/1 | Complete    | 2026-03-13 |
| 11. Observability | 2/2 | Complete    | 2026-03-13 |
| 12. Production Launch | 1/1 | Complete   | 2026-03-13 |
