# Requirements: Third Wave Mail — Code Review & Ship

**Defined:** 2026-03-13
**Core Value:** Reliably send targeted email campaigns with tracking and analytics — every email must be deliverable, trackable, and the data must be accurate.

## v1 Requirements

Requirements for production-ready launch. Each maps to roadmap phases.

### Critical Bug Fixes

- [ ] **BUG-01**: Campaign send dispatched via BullMQ Queue.add() not raw redis.lpush
- [ ] **BUG-02**: Duplicate send prevented with UNIQUE constraint on messages(campaign_id, contact_id) and SES idempotency check
- [ ] **BUG-03**: A/B holdback contacts persisted in PostgreSQL, not Redis-only storage
- [ ] **BUG-04**: Redis campaign completion counter uses atomic Lua script and noeviction policy
- [ ] **BUG-05**: Scheduled campaign trigger exists and correctly transitions SCHEDULED → SENDING
- [ ] **BUG-06**: Resend-to-non-openers trigger is wired up and functional

### Compliance

- [x] **COMP-01**: SNS bounce/complaint handler is idempotent (handles duplicate SNS deliveries)
- [x] **COMP-02**: Hard bounces immediately suppress contact and prevent future sends
- [x] **COMP-03**: Complaints immediately suppress contact and prevent future sends
- [x] **COMP-04**: RFC 8058 List-Unsubscribe and List-Unsubscribe-Post headers on every outbound email
- [x] **COMP-05**: Unsubscribe endpoint handles server-to-server POST without session/CSRF requirements
- [x] **COMP-06**: Physical mailing address enforced at send layer, not just template layer
- [x] **COMP-07**: Import flow does not overwrite bounced/unsubscribed/complained contact status
- [x] **COMP-08**: Unsubscribed contacts excluded from pending/scheduled sends at query time

### Data Integrity

- [ ] **DATA-01**: MPP machine open detection correctly identifies Apple Mail proxy user-agents
- [ ] **DATA-02**: Machine opens flagged but not deleted (preserved for data completeness)
- [ ] **DATA-03**: A/B test winner logic uses human opens/clicks, not raw (MPP-inflated) data
- [ ] **DATA-04**: A/B test has minimum sample size guard before declaring winner
- [ ] **DATA-05**: Resend-to-non-openers excludes machine opens from "opened" definition
- [ ] **DATA-06**: All .catch(() => {}) replaced with proper error logging
- [ ] **DATA-07**: Campaign counters accurate (no silent drift from swallowed errors)
- [ ] **DATA-08**: Click tracking redirect preserves original URL including encoded params and UTMs
- [ ] **DATA-09**: Click tracking queries SENT event link_map first, not events table scan
- [ ] **DATA-10**: Segment query AND/OR precedence produces correct contact lists
- [ ] **DATA-11**: Segment preview counts match actual send counts

### Infrastructure & Security

- [ ] **INFRA-01**: Redis maxmemory-policy set to noeviction (not allkeys-lru)
- [ ] **INFRA-02**: CORS origin changed from wildcard (origin: true) to explicit allowlist
- [ ] **INFRA-03**: PgBouncer pool sizing matches application pool demands (fix 60 vs 40 mismatch)
- [ ] **INFRA-04**: BullMQ worker IORedis clients have maxRetriesPerRequest: null
- [ ] **INFRA-05**: Graceful shutdown (SIGTERM/SIGINT) for Fastify and all worker processes
- [ ] **INFRA-06**: Health endpoint unauthenticated and returns 200 with DB+Redis check
- [ ] **INFRA-07**: Redis AOF persistence with appendfsync everysec
- [ ] **INFRA-08**: @fastify/helmet added for security headers
- [ ] **INFRA-09**: Redis counter TTL set and atomic decrement-and-check for campaign completion
- [ ] **INFRA-10**: SES configuration set 'marketing' verified or made configurable via env var

### Code Quality

- [ ] **QUAL-01**: ESLint v9 flat config with typescript-eslint v8 configured across monorepo
- [ ] **QUAL-02**: no-floating-promises rule enabled (catches async bugs in Fastify handlers/workers)
- [ ] **QUAL-03**: Vitest configured with coverage for critical paths
- [ ] **QUAL-04**: Tests for SNS handler idempotency
- [ ] **QUAL-05**: Tests for bulk-send deduplication
- [ ] **QUAL-06**: Tests for segment query logic (AND/OR precedence)
- [ ] **QUAL-07**: lint-staged + husky pre-commit hooks configured
- [ ] **QUAL-08**: tsconfig strict: true verified; any escapes in JSONB handling removed
- [ ] **QUAL-09**: Error response shape consistent across all routes ({ error: { code, message } })
- [ ] **QUAL-10**: Prettier configured with eslint-config-prettier integration

### Operational Readiness

- [ ] **OPS-01**: Campaign state machine recovers correctly after worker crash (not stuck in SENDING)
- [ ] **OPS-02**: SES rate limit respected under bulk send (worker concurrency ≤ 40/sec)
- [ ] **OPS-03**: Scheduled campaign timezone conversion correct (stored as UTC, evaluated correctly)
- [ ] **OPS-04**: MJML output valid across all editor block combinations
- [ ] **OPS-05**: Image URLs in email output are absolute, not relative
- [ ] **OPS-06**: Webhook HMAC uses constant-time comparison
- [ ] **OPS-07**: Webhook endpoint auto-disable after 50 failures works correctly

### Observability

- [ ] **OBS-01**: Sentry configured for API, workers, and frontend
- [ ] **OBS-02**: Pino structured logging with PII redaction (emails, JWTs) in production
- [ ] **OBS-03**: pino-pretty removed from production builds
- [ ] **OBS-04**: SES DNS records verified (SPF, DKIM, DMARC p=quarantine minimum)
- [ ] **OBS-05**: External uptime monitoring configured for /health endpoint

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Automation

- **AUTO-01**: Welcome email automation triggered on contact creation
- **AUTO-02**: Drip sequence automation with configurable delays
- **AUTO-03**: Engagement-based trigger automations

### Advanced Analytics

- **ANAL-01**: CloudWatch alarm at 4% bounce rate and 0.08% complaint rate
- **ANAL-02**: Engagement-based sunset policies (auto-suppress 0-engagement contacts after 6 months)
- **ANAL-03**: Suppression list export for compliance evidence
- **ANAL-04**: Email validation / bounce prediction via third-party API

### Platform

- **PLAT-01**: Multi-tenant / SaaS mode
- **PLAT-02**: Predictive send-time optimization
- **PLAT-03**: Template marketplace

## Out of Scope

| Feature | Reason |
|---------|--------|
| Real-time chat | Not relevant to email marketing |
| Mobile native app | Web-responsive is sufficient; doubles maintenance |
| Social proof / template marketplace | High curation burden, distraction from core |
| Email list cleaning service | Third-party integration, post-launch |
| OpenTelemetry distributed tracing | Nice-to-have, not launch blocker |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| BUG-01 | Phase 1 | Pending |
| BUG-02 | Phase 1 | Pending |
| BUG-03 | Phase 1 | Pending |
| BUG-04 | Phase 1 | Pending |
| BUG-05 | Phase 1 | Pending |
| BUG-06 | Phase 1 | Pending |
| COMP-01 | Phase 2 | Complete |
| COMP-02 | Phase 2 | Complete |
| COMP-03 | Phase 2 | Complete |
| COMP-04 | Phase 2 | Complete |
| COMP-05 | Phase 2 | Complete |
| COMP-06 | Phase 2 | Complete |
| COMP-07 | Phase 2 | Complete |
| COMP-08 | Phase 2 | Complete |
| DATA-01 | Phase 3 | Pending |
| DATA-02 | Phase 3 | Pending |
| DATA-03 | Phase 3 | Pending |
| DATA-04 | Phase 3 | Pending |
| DATA-05 | Phase 3 | Pending |
| DATA-06 | Phase 4 | Pending |
| DATA-07 | Phase 4 | Pending |
| DATA-08 | Phase 5 | Pending |
| DATA-09 | Phase 5 | Pending |
| DATA-10 | Phase 5 | Pending |
| DATA-11 | Phase 5 | Pending |
| INFRA-01 | Phase 6 | Pending |
| INFRA-02 | Phase 6 | Pending |
| INFRA-03 | Phase 6 | Pending |
| INFRA-04 | Phase 6 | Pending |
| INFRA-05 | Phase 6 | Pending |
| INFRA-06 | Phase 6 | Pending |
| INFRA-07 | Phase 6 | Pending |
| INFRA-08 | Phase 6 | Pending |
| INFRA-09 | Phase 6 | Pending |
| INFRA-10 | Phase 6 | Pending |
| QUAL-01 | Phase 7 | Pending |
| QUAL-02 | Phase 7 | Pending |
| QUAL-03 | Phase 7 | Pending |
| QUAL-04 | Phase 7 | Pending |
| QUAL-05 | Phase 7 | Pending |
| QUAL-06 | Phase 7 | Pending |
| QUAL-07 | Phase 7 | Pending |
| QUAL-08 | Phase 8 | Pending |
| QUAL-09 | Phase 8 | Pending |
| QUAL-10 | Phase 7 | Pending |
| OPS-01 | Phase 9 | Pending |
| OPS-02 | Phase 9 | Pending |
| OPS-03 | Phase 9 | Pending |
| OPS-04 | Phase 10 | Pending |
| OPS-05 | Phase 10 | Pending |
| OPS-06 | Phase 9 | Pending |
| OPS-07 | Phase 9 | Pending |
| OBS-01 | Phase 11 | Pending |
| OBS-02 | Phase 11 | Pending |
| OBS-03 | Phase 11 | Pending |
| OBS-04 | Phase 12 | Pending |
| OBS-05 | Phase 12 | Pending |

**Coverage:**
- v1 requirements: 52 total
- Mapped to phases: 52
- Unmapped: 0 ✓

---
*Requirements defined: 2026-03-13*
*Last updated: 2026-03-13 after initial definition*
