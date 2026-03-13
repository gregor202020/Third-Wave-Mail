---
phase: 11-observability
verified: 2026-03-13T06:00:00Z
status: passed
score: 8/8 must-haves verified
re_verification: false
---

# Phase 11: Observability Verification Report

**Phase Goal:** Errors and system behavior are visible in production without exposing user PII in logs
**Verified:** 2026-03-13T06:00:00Z
**Status:** PASSED
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | An unhandled exception in the API creates a Sentry event with context | VERIFIED | `packages/api/src/instrument.mjs` calls `Sentry.init`; `app.ts` calls `Sentry.setupFastifyErrorHandler(app)` before all plugins; API Dockerfile loads instrument.mjs via `--import` |
| 2 | An unhandled exception in any worker creates a Sentry event with context | VERIFIED | `packages/workers/src/instrument.mjs` calls `Sentry.init`; workers Dockerfile loads via `--import ./packages/workers/src/instrument.mjs` |
| 3 | Production log output is structured JSON with email addresses and JWT tokens redacted | VERIFIED | `app.ts` defines `PII_REDACT_PATHS` covering `req.headers.authorization`, `req.headers.cookie`, `req.body.email`, `req.body.password`, `*.email`; `buildLogger()` returns bare `{ level, redact }` in production — no pino-pretty |
| 4 | pino-pretty is absent from all production bundles and docker images | VERIFIED | Both `packages/api/package.json` and `packages/workers/package.json` list `pino-pretty` only under `devDependencies`; all runtime guards confirmed (`config.NODE_ENV !== 'production'` in app.ts, `isProduction` ternary in logger.ts) |
| 5 | Workers produce structured JSON logs in production, not console.log text | VERIFIED | Zero `console.log/error/warn` calls remain in `packages/workers/src/`; all 7 files import `{ logger }` from `../logger.js` or `./logger.js` and use `logger.info/error/warn` |
| 6 | An unhandled exception in the Next.js frontend (client or server) creates a Sentry event | VERIFIED | `instrumentation.ts` exports `register()` with dynamic runtime-conditional imports and `onRequestError = Sentry.captureRequestError`; `instrumentation-client.ts` calls `Sentry.init` with `NEXT_PUBLIC_SENTRY_DSN` |
| 7 | React rendering errors are caught by the global error boundary and reported to Sentry | VERIFIED | `packages/frontend/src/app/global-error.tsx` is a `'use client'` component that calls `Sentry.captureException(error)` in `useEffect` |
| 8 | Server Component and middleware errors are captured via the onRequestError hook | VERIFIED | `instrumentation.ts` line 13: `export const onRequestError = Sentry.captureRequestError` |

**Score:** 8/8 truths verified

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `packages/api/src/instrument.mjs` | Sentry ESM init for API | VERIFIED | Exists, 8 lines, calls `Sentry.init` with `process.env.SENTRY_DSN` and `sendDefaultPii: false` |
| `packages/workers/src/instrument.mjs` | Sentry ESM init for workers | VERIFIED | Exists, 8 lines, identical pattern to API instrument |
| `packages/workers/src/logger.ts` | Pino logger instance for workers | VERIFIED | Exports `logger`; redact paths cover `*.email` and `*.authorization`; pino-pretty guarded by `isProduction` ternary |
| `packages/api/tests/sentry-init.unit.test.ts` | Source-code scan verifying Sentry wiring | VERIFIED | 5 assertions: instrument.mjs existence, `Sentry.init`, `process.env.SENTRY_DSN`, `setupFastifyErrorHandler`, Dockerfile `--import` pattern |
| `packages/api/tests/pino-redact.unit.test.ts` | Source-code scan verifying redact paths and pino-pretty absence | VERIFIED | 10 assertions across API redact config, workers instrument, workers logger, workers Dockerfile |
| `packages/frontend/src/instrumentation.ts` | Next.js server-side Sentry init + onRequestError hook | VERIFIED | Exports `register()` and `onRequestError = Sentry.captureRequestError` |
| `packages/frontend/src/instrumentation-client.ts` | Client-side Sentry init | VERIFIED | Calls `Sentry.init` with `NEXT_PUBLIC_SENTRY_DSN` |
| `packages/frontend/src/app/global-error.tsx` | React error boundary for App Router | VERIFIED | `'use client'`, calls `Sentry.captureException(error)` in `useEffect` |
| `packages/frontend/next.config.ts` | Next config wrapped with withSentryConfig | VERIFIED | `export default withSentryConfig(nextConfig, { silent: true })` |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `packages/api/Dockerfile` | `packages/api/src/instrument.mjs` | `CMD node --import ./src/instrument.mjs` | WIRED | Line 29: `CMD ["node", "--import", "./packages/api/src/instrument.mjs", "packages/api/dist/index.js"]`; COPY line on line 24 ensures file exists in production image |
| `packages/workers/Dockerfile` | `packages/workers/src/instrument.mjs` | `CMD node --import ./src/instrument.mjs` | WIRED | Line 28: `CMD ["node", "--import", "./packages/workers/src/instrument.mjs", "packages/workers/dist/index.js"]`; COPY line on line 24 present |
| `packages/api/src/app.ts` | `@sentry/node` | `setupFastifyErrorHandler` | WIRED | Line 63: `Sentry.setupFastifyErrorHandler(app)` called before plugin registrations |
| `packages/workers/src/index.ts` | `packages/workers/src/logger.ts` | `import { logger }` | WIRED | Line 3: `import { logger } from './logger.js';` — logger used in 6 call sites |
| `packages/frontend/next.config.ts` | `@sentry/nextjs` | `withSentryConfig` wrapper | WIRED | Lines 2 and 8: imported and wrapping export |
| `packages/frontend/src/instrumentation.ts` | `packages/frontend/src/sentry.server.config.ts` | dynamic import in register() | WIRED | Line 5: `await import("./sentry.server.config")` inside `NEXT_RUNTIME === "nodejs"` branch |

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|---------|
| OBS-01 | 11-01-PLAN, 11-02-PLAN | Sentry configured for API, workers, and frontend | SATISFIED | `instrument.mjs` in API and workers with `--import` Dockerfile wiring; `@sentry/nextjs` in frontend with `instrumentation.ts`, `instrumentation-client.ts`, `global-error.tsx`, and `withSentryConfig` |
| OBS-02 | 11-01-PLAN | Pino structured logging with PII redaction (emails, JWTs) in production | SATISFIED | `PII_REDACT_PATHS` in `app.ts` covers `authorization`, `cookie`, `email`, `password`; workers `logger.ts` redacts `*.email` and `*.authorization`; production path returns bare `{ level, redact }` — no formatter |
| OBS-03 | 11-01-PLAN | pino-pretty removed from production builds | SATISFIED | `pino-pretty` is `devDependencies` only in both `packages/api/package.json` and `packages/workers/package.json`; runtime guards confirmed in both `app.ts` and `logger.ts` |

No orphaned requirements: OBS-01, OBS-02, OBS-03 are the only Phase 11 requirements in REQUIREMENTS.md traceability table (lines 179-181). All three are claimed and verified.

---

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| None | — | — | — | — |

No TODOs, FIXMEs, placeholder comments, empty implementations, or `console.*` calls found in any modified files. The `pino-pretty` reference in `app.ts` line 46 is inside the guarded non-production branch — not a production leak.

---

### Human Verification Required

#### 1. Sentry Event Delivery

**Test:** Deploy to production with a real `SENTRY_DSN`, then trigger a deliberate 500 error (e.g., call an API route that throws). Check Sentry project dashboard for the event.
**Expected:** Sentry event appears within seconds with request context attached. No email addresses or auth tokens appear in the event breadcrumbs or request data.
**Why human:** Cannot verify live network delivery to Sentry's intake API without an active DSN and a running environment.

#### 2. Worker Sentry ESM Init Timing

**Test:** Start a worker container with a real `SENTRY_DSN`. Cause a job-level exception before any job runs. Verify Sentry captures it.
**Expected:** The `--import ./packages/workers/src/instrument.mjs` loads Sentry before any worker code executes — even startup errors are captured.
**Why human:** ESM `--import` timing requires a live Node.js process to confirm hook registration order.

#### 3. Frontend Client-Side Error Capture

**Test:** In a browser, trigger a React render error in the deployed frontend. Verify the event appears in Sentry.
**Expected:** `global-error.tsx` catches the render error, `captureException` fires, event visible in Sentry with no PII in the payload.
**Why human:** Requires a running browser against a deployed Next.js app with `NEXT_PUBLIC_SENTRY_DSN` baked into the client bundle.

---

### Gaps Summary

No gaps. All eight observable truths are fully verified at all three levels (exists, substantive, wired). The three requirements OBS-01, OBS-02, and OBS-03 are satisfied by concrete implementation evidence. Zero console calls remain in workers. pino-pretty is isolated to devDependencies with runtime guards in both packages.

---

_Verified: 2026-03-13T06:00:00Z_
_Verifier: Claude (gsd-verifier)_
