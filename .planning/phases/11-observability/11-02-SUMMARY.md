---
phase: 11-observability
plan: 02
subsystem: infra
tags: [sentry, nextjs, error-tracking, instrumentation, react-error-boundary]

requires:
  - phase: 11-observability-01
    provides: Sentry DSN and project setup for API/workers

provides:
  - "@sentry/nextjs installed with full App Router instrumentation"
  - "Server-side and edge Sentry init via instrumentation.ts register() hook"
  - "Client-side Sentry init via instrumentation-client.ts"
  - "React error boundary (global-error.tsx) capturing unhandled render errors"
  - "next.config.ts wrapped with withSentryConfig for source map upload"
  - "SENTRY_DSN / NEXT_PUBLIC_SENTRY_DSN env vars documented in docker-compose"

affects: [deployment, observability, frontend]

tech-stack:
  added: ["@sentry/nextjs"]
  patterns:
    - "Next.js App Router instrumentation via register() + onRequestError hooks"
    - "NEXT_PUBLIC_SENTRY_DSN as Docker ARG baked into client bundle at build time"
    - "SENTRY_DSN as runtime ENV for server-side capture"

key-files:
  created:
    - packages/frontend/src/sentry.server.config.ts
    - packages/frontend/src/sentry.edge.config.ts
    - packages/frontend/src/instrumentation.ts
    - packages/frontend/src/instrumentation-client.ts
    - packages/frontend/src/app/global-error.tsx
  modified:
    - packages/frontend/next.config.ts
    - packages/frontend/Dockerfile
    - docker-compose.yml
    - packages/frontend/package.json

key-decisions:
  - "NEXT_PUBLIC_SENTRY_DSN passed as Docker ARG before build step so it is baked into the client bundle at image build time"
  - "SENTRY_DSN added as ENV in the production stage of the Dockerfile for server-side runtime access"
  - "withSentryConfig called with { silent: true } to suppress noisy build output"
  - "onRequestError = Sentry.captureRequestError used directly as re-export — no wrapper needed for Next.js 15+ server error capture"
  - "global-error.tsx uses inline styles to avoid Tailwind dependency in error boundary context"

patterns-established:
  - "Instrumentation pattern: dynamic import of runtime-specific Sentry config inside register() based on NEXT_RUNTIME"
  - "Client bundle env pattern: NEXT_PUBLIC_* vars must be Docker ARG before the build RUN step"

requirements-completed: [OBS-01]

duration: 6min
completed: 2026-03-13
---

# Phase 11 Plan 02: Frontend Sentry Instrumentation Summary

**@sentry/nextjs integrated into Next.js 16.1.6 App Router with server, edge, and client init hooks plus a React error boundary that captures unhandled render exceptions**

## Performance

- **Duration:** ~6 min
- **Started:** 2026-03-13T05:07:39Z
- **Completed:** 2026-03-13T05:13:46Z
- **Tasks:** 1
- **Files modified:** 8

## Accomplishments

- Installed @sentry/nextjs and created all four instrumentation entry points (server config, edge config, server instrumentation hook, client instrumentation hook)
- Created global-error.tsx App Router error boundary that calls captureException on every unhandled React render error
- Wrapped next.config.ts with withSentryConfig to enable source map upload at build time
- Added NEXT_PUBLIC_SENTRY_DSN as a Dockerfile ARG (baked into client bundle) and SENTRY_DSN as runtime ENV; both documented in docker-compose.yml

## Task Commits

1. **Task 1: Install @sentry/nextjs and create instrumentation files** - `6b8e995` (feat)

## Files Created/Modified

- `packages/frontend/src/sentry.server.config.ts` - Node.js runtime Sentry init (SENTRY_DSN, tracesSampleRate 1.0)
- `packages/frontend/src/sentry.edge.config.ts` - Edge runtime Sentry init (same config)
- `packages/frontend/src/instrumentation.ts` - Exports register() with dynamic runtime-conditional imports + onRequestError = Sentry.captureRequestError
- `packages/frontend/src/instrumentation-client.ts` - Browser Sentry init using NEXT_PUBLIC_SENTRY_DSN
- `packages/frontend/src/app/global-error.tsx` - React error boundary with useEffect captureException, "Try again" reset button
- `packages/frontend/next.config.ts` - Wrapped with withSentryConfig({ silent: true })
- `packages/frontend/Dockerfile` - Added ARG NEXT_PUBLIC_SENTRY_DSN before build step; added ENV SENTRY_DSN in prod stage
- `docker-compose.yml` - Added SENTRY_DSN and NEXT_PUBLIC_SENTRY_DSN to frontend service environment block

## Decisions Made

- NEXT_PUBLIC_SENTRY_DSN must be a Docker ARG passed before the `npm run build` step so Next.js can bake it into the client bundle at build time (not available at runtime for client-side code)
- SENTRY_DSN is a standard runtime ENV — injected after build, read by Node.js server process
- `{ silent: true }` passed to withSentryConfig to suppress verbose Sentry build output
- onRequestError re-exported directly as `Sentry.captureRequestError` — no wrapper needed

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

To enable Sentry error capture, set these environment variables before deploying:

- `SENTRY_DSN` — server-side DSN (from Sentry project settings)
- `NEXT_PUBLIC_SENTRY_DSN` — client-side DSN (same value, passed as Docker build ARG)

Both default to empty string (Sentry silently no-ops when DSN is unset).

## Next Phase Readiness

- Frontend errors now flow to Sentry alongside API and worker errors
- All three runtime contexts covered: Node.js server, Edge middleware, browser client
- No blockers for remaining observability work

## Self-Check: PASSED

- `packages/frontend/src/instrumentation.ts` — FOUND
- `packages/frontend/src/instrumentation-client.ts` — FOUND
- `packages/frontend/src/sentry.server.config.ts` — FOUND
- `packages/frontend/src/sentry.edge.config.ts` — FOUND
- `packages/frontend/src/app/global-error.tsx` — FOUND
- `packages/frontend/next.config.ts` — FOUND (withSentryConfig)
- Commit `6b8e995` — FOUND

---
*Phase: 11-observability*
*Completed: 2026-03-13*
