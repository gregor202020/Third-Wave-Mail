---
phase: 04-data-integrity-error-handling
plan: "01"
subsystem: api
tags: [error-handling, logging, fire-and-forget, tracking, segments, auth]
dependency_graph:
  requires: []
  provides: [contextual-error-logging-for-all-fire-and-forget-paths]
  affects: [packages/api/src/routes/tracking.ts, packages/api/src/services/segments.service.ts, packages/api/src/plugins/auth.ts]
tech_stack:
  added: []
  patterns: [fire-and-forget with .catch logging, request.log.error for Fastify routes, console.warn for service-layer non-critical failures]
key_files:
  created: []
  modified:
    - packages/api/src/routes/tracking.ts
    - packages/api/src/services/segments.service.ts
    - packages/api/src/plugins/auth.ts
decisions:
  - id: DATA-06-logging-levels
    summary: Tracking route failures use request.log.error (Pino structured logging), while service/plugin non-critical failures use console.warn — differentiates infrastructure errors from housekeeping failures
  - id: DATA-06-no-await
    summary: Fire-and-forget model preserved in all five sites — no await added; pixel/redirect responses still return immediately
  - id: DATA-06-auth-key-id
    summary: Auth plugin logs keyId (not key prefix or hash) for last_used_at failure — sufficient for DB lookup without exposing credentials
metrics:
  duration_minutes: 3
  completed_date: "2026-03-12"
  tasks_completed: 2
  tasks_total: 2
  files_modified: 3
requirements_satisfied: [DATA-06]
---

# Phase 04 Plan 01: Silent Catch Callback Error Logging Summary

Replace five silent `.catch(() => {})` callbacks with contextual error logging to make production failures debuggable.

## What Was Built

Five fire-and-forget `.catch(() => {})` callbacks across three files were replaced with structured error logging that includes contextual identifiers. No `await` was added; the fire-and-forget async model is fully preserved.

### tracking.ts — Two callbacks replaced

- `recordOpen` failure now logs `{ err, messageId }` at `request.log.error` level (Pino/Fastify structured JSON)
- `recordClick` failure now logs `{ err, messageId, linkHash }` at `request.log.error` level

### segments.service.ts — Two callbacks replaced

- `getSegmentContacts` cache-write failure logs `{ err, segmentId }` at `console.warn` level
- `getSegmentCount` cache-write failure logs `{ err, segmentId }` at `console.warn` level
- `console.warn` chosen (not `error`) because stale cache count is acceptable; failure is non-critical

### auth.ts — One callback replaced

- API key `last_used_at` update failure logs `{ err, keyId: key.id }` at `console.warn` level
- Uses `key.id` (DB row ID) rather than key prefix or hash — no credentials exposed

## Decisions Made

| Decision | Rationale |
|----------|-----------|
| `request.log.error` for tracking routes | Fastify routes have access to `request.log` (Pino); structured JSON with `{ err, messageId }` integrates with log aggregation |
| `console.warn` for services/plugins | No Fastify request context available; `warn` signals non-critical failures distinct from infrastructure errors |
| `keyId` not `key_prefix` in auth log | `key.id` is the DB primary key, sufficient for lookup; prefix could narrow guessing attacks |
| Fire-and-forget preserved | Pixel and redirect endpoints must return immediately — adding `await` would block responses |

## Verification

```
grep -rn '\.catch(() => {})' packages/api/  → 0 matches
grep -n 'await recordOpen|await recordClick' tracking.ts  → 0 matches
```

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check

- [x] `packages/api/src/routes/tracking.ts` modified — confirmed via git log
- [x] `packages/api/src/services/segments.service.ts` modified — confirmed via git log
- [x] `packages/api/src/plugins/auth.ts` modified — confirmed via git log
- [x] Commit 62aa866 — tracking.ts changes
- [x] Commit f4f93bc — segments.service.ts + auth.ts changes
- [x] Zero `.catch(() => {})` in packages/api/ — verified
- [x] No `await recordOpen` or `await recordClick` — verified

## Self-Check: PASSED
