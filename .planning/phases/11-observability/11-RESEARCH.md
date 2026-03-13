# Phase 11: Observability - Research

**Researched:** 2026-03-13
**Domain:** Sentry error tracking + Pino structured logging with PII redaction
**Confidence:** HIGH

## Summary

This phase adds two distinct capabilities: (1) Sentry error capture across all three runtime targets — the Fastify API (`@sentry/node`), the BullMQ workers (`@sentry/node`), and the Next.js frontend (`@sentry/nextjs`); (2) production-safe structured JSON logging via Pino with redaction of email addresses and JWT tokens, plus guaranteed removal of `pino-pretty` from production artifacts.

The stack is entirely pre-decided by prior phases: Fastify uses its built-in Pino logger (already configured via `LOG_LEVEL` env var in `config.ts`), and no alternative logging library should be introduced. The API and workers packages are ESM (`"type": "module"` in their package.json files), which imposes a specific `--import` flag requirement for Sentry initialization in Node.js. The frontend is Next.js 16.1.6 with App Router, which requires `@sentry/nextjs` and the instrumentation hook pattern.

`pino-pretty` is not currently installed in any package.json (confirmed by grep). The OBS-03 requirement therefore means: keep it absent from production images going forward, establish the conditional check in code so it can never silently slip in, and verify the Dockerfiles do not accidentally install it via devDependencies.

**Primary recommendation:** Install `@sentry/node ^10.43.0` in both `@twmail/api` and `@twmail/workers`. Install `@sentry/nextjs ^10.43.0` in `@twmail/frontend`. Use the `--import ./instrument.mjs` Node.js flag for API and workers. Configure Fastify's built-in Pino logger with a `redact` block to strip email addresses and Authorization headers before any log line is emitted.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@sentry/node` | ^10.43.0 | Error capture for Fastify API + BullMQ workers | Official Sentry SDK for Node.js; provides `setupFastifyErrorHandler` + automatic unhandledRejection capture |
| `@sentry/nextjs` | ^10.43.0 | Error capture for Next.js frontend | Official Sentry SDK with App Router support; handles client, server, and edge runtimes |
| pino (built-in to Fastify) | already installed | Structured JSON logging | Fastify ships with pino; no extra install needed |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `pino-pretty` | devDependency only | Human-readable logs in dev | Development terminals only — must NOT appear in production builds |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `@sentry/node` | `@sentry/core` + manual transport | More control, much more setup work — not worth it |
| Pino redact paths | Custom serializers | Both work; pino's built-in `redact` is zero-overhead (uses fast-redact), simpler config |

### Installation
```bash
# In packages/api
npm install @sentry/node --workspace=packages/api

# In packages/workers
npm install @sentry/node --workspace=packages/workers

# In packages/frontend
npm install @sentry/nextjs --workspace=packages/frontend
```

## Architecture Patterns

### Recommended Project Structure
```
packages/
├── api/
│   ├── src/
│   │   ├── instrument.mjs     # Sentry init — MUST load before anything else (ESM)
│   │   ├── app.ts             # Add Sentry.setupFastifyErrorHandler(app)
│   │   └── config.ts          # Add SENTRY_DSN to env schema
├── workers/
│   ├── src/
│   │   ├── instrument.mjs     # Sentry init for workers (same pattern)
│   │   └── index.ts           # No changes needed — Sentry captures process.on handlers
├── frontend/
│   ├── src/
│   │   ├── instrumentation.ts         # Next.js instrumentation hook (server)
│   │   ├── instrumentation-client.ts  # Client-side Sentry init
│   │   └── app/
│   │       └── global-error.tsx       # React error boundary for App Router
│   └── next.config.ts                 # Wrap with withSentryConfig()
```

### Pattern 1: Sentry ESM Init for Node.js (API + Workers)

**What:** Create `instrument.mjs` (ESM format) that initializes Sentry before any other import is resolved.
**When to use:** Both `@twmail/api` and `@twmail/workers` packages have `"type": "module"` — ESM requires the `--import` flag, not `require()`.

The `--import` flag is available in Node 18.19.0+. This project requires `>=22.0.0` (from root `package.json`), so this is safe.

```typescript
// packages/api/src/instrument.mjs
// Source: https://docs.sentry.io/platforms/javascript/guides/node/install/esm/
import * as Sentry from '@sentry/node';

Sentry.init({
  dsn: process.env.SENTRY_DSN,           // empty/undefined = Sentry disabled
  environment: process.env.NODE_ENV,
  tracesSampleRate: 1.0,                 // adjust down in high-traffic production
  sendDefaultPii: false,                 // do NOT send PII (request bodies, user IP)
});
```

Start command in Dockerfile/package.json must become:
```bash
node --import ./src/instrument.mjs dist/index.js
# or via NODE_OPTIONS:
NODE_OPTIONS="--import ./src/instrument.mjs" node dist/index.js
```

Note: `instrument.mjs` must be ESM (`.mjs` extension or `"type":"module"`). It cannot be TypeScript — it runs before the build system. Keep it plain `.mjs`.

### Pattern 2: Fastify Error Handler Registration

**What:** Call `Sentry.setupFastifyErrorHandler(app)` in `buildApp()` after creating the Fastify instance but before registering plugins.
**When to use:** Fastify-specific — replaces manual error forwarding.

```typescript
// packages/api/src/app.ts
// Source: https://docs.sentry.io/platforms/javascript/guides/fastify/
import * as Sentry from '@sentry/node';

export async function buildApp() {
  const config = getConfig();
  const app = Fastify({ logger: buildLogger(config) });

  // Register Sentry error handler FIRST, before other plugins
  Sentry.setupFastifyErrorHandler(app);

  // ... rest of existing plugin registrations
}
```

`setupFastifyErrorHandler` captures unhandled exceptions thrown within Fastify route handlers and plugins. The existing `errorHandlerPlugin` (`app.setErrorHandler`) can remain — it handles structured error responses to the client. Sentry captures the raw error before the formatted response is sent.

### Pattern 3: Pino Redact Configuration

**What:** Pass a `redact` block to the Fastify logger options to strip PII from all log lines.
**When to use:** Production always. Development can use pino-pretty transport (conditionally).

Fastify's logger is Pino. Redact paths use dot notation and wildcard `*`. The `[Redacted]` censor replaces matched values before JSON serialization — no performance overhead from string scanning.

Paths to redact:
- `req.headers.authorization` — captures `Bearer <JWT>`
- `req.headers.cookie` — session cookies
- `req.body.email` — login/register request bodies
- `req.body.password` — login request bodies

```typescript
// packages/api/src/app.ts — buildLogger helper
// Source: https://betterstack.com/community/guides/logging/how-to-install-setup-and-use-pino-to-log-node-js-applications/
function buildLogger(config: Config) {
  const redact = {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'req.body.email',
      'req.body.password',
      '*.email',                    // any top-level object with email key
    ],
    censor: '[Redacted]',
  };

  if (config.NODE_ENV !== 'production') {
    return {
      level: config.LOG_LEVEL,
      redact,
      transport: {
        target: 'pino-pretty',
        options: { translateTime: 'HH:MM:ss Z', ignore: 'pid,hostname' },
      },
    };
  }

  // Production: pure JSON, no pino-pretty
  return { level: config.LOG_LEVEL, redact };
}
```

Then in `buildApp()`:
```typescript
const app = Fastify({ logger: buildLogger(config) });
```

### Pattern 4: Workers Pino Logger (separate from Fastify)

**What:** Workers use `console.log` today. Replace with a lightweight pino logger for structured JSON output.
**When to use:** `@twmail/workers` package — no Fastify, so must create pino instance directly.

```typescript
// packages/workers/src/logger.ts
import pino from 'pino';

const isProduction = process.env.NODE_ENV === 'production';

export const logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  redact: {
    paths: ['*.email', '*.authorization'],
    censor: '[Redacted]',
  },
  ...(isProduction
    ? {}
    : {
        transport: {
          target: 'pino-pretty',
          options: { translateTime: 'HH:MM:ss Z', ignore: 'pid,hostname' },
        },
      }),
});
```

Workers package.json needs `pino` added as a dependency (it's currently not listed — Fastify brings it in the api package but not workers).

### Pattern 5: Next.js Frontend Sentry Setup

**What:** Create the three required instrumentation files plus update `next.config.ts`.

```typescript
// packages/frontend/src/instrumentation.ts
// Source: https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config');
  }
  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config');
  }
}

export const onRequestError = Sentry.captureRequestError;
```

```typescript
// packages/frontend/src/instrumentation-client.ts
import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 1.0,
  debug: false,
});
```

```typescript
// packages/frontend/next.config.ts
import { withSentryConfig } from '@sentry/nextjs';

const nextConfig = { /* existing config */ };

export default withSentryConfig(nextConfig, {
  silent: true,  // suppress build output
  sourcemaps: { disable: false },
});
```

The frontend also needs a `global-error.tsx` in `app/` for React error boundary.

### Anti-Patterns to Avoid
- **Importing Sentry after application code in ESM:** Any module imported before `instrument.mjs` runs is NOT instrumented. The `--import` flag ensures Sentry loads first. Do not attempt to `import * as Sentry` at the top of `app.ts` and call `Sentry.init()` there — with ESM, other module-level imports may execute before `Sentry.init()` completes.
- **Setting `sendDefaultPii: true`:** This sends request bodies, user IPs, and other PII to Sentry. Leave it `false`. PII redaction at the pino level handles logs; Sentry should only receive error objects and stack traces.
- **pino-pretty in `dependencies` (not `devDependencies`):** If `pino-pretty` moves to `dependencies`, Docker's `npm install --omit=dev` will still install it. Keep it in `devDependencies` and guard the transport block with `NODE_ENV !== 'production'`.
- **Wildcard pino redact paths without specificity:** Using `'*'` as a top-level redact path removes everything. Use specific paths. The path `'*.email'` means "any object at the root log level that has an `email` key" — not "all nested email fields everywhere." For deep nesting, add explicit paths.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Error reporting | Custom HTTP POST to logging service | `@sentry/node` | Handles batching, retries, source maps, breadcrumbs, release tracking |
| Unhandled rejection capture | `process.on('unhandledRejection')` manual capture | `@sentry/node` (automatic) | Sentry hooks these automatically on `Sentry.init()` |
| Log field scrubbing | Regex replace on JSON strings | Pino's built-in `redact` with fast-redact | Zero overhead path-based removal; regex on serialized JSON is fragile and slow |
| Next.js error boundary | Custom React error boundary with fetch to logging | `@sentry/nextjs` + `global-error.tsx` | SDK handles hydration errors, RSC errors, and edge runtime errors |

**Key insight:** Custom PII scrubbing via regex on log strings is the classic mistake — it misses nested fields, breaks on key ordering changes, and adds serialization overhead. Pino's `redact` operates on the object before serialization.

## Common Pitfalls

### Pitfall 1: ESM Import Order — Sentry Misses Instrumentation
**What goes wrong:** Sentry is initialized inside `app.ts` via a top-level import, but Fastify and other modules load first at module-eval time. Sentry's OpenTelemetry hooks never wrap those modules.
**Why it happens:** ESM static imports are hoisted and resolved before any code runs. `Sentry.init()` called inside a function body is too late for module-level instrumentation.
**How to avoid:** Use `--import ./src/instrument.mjs` as the Node startup flag. `instrument.mjs` must be a standalone file with no imports other than `@sentry/node`.
**Warning signs:** Sentry events appear but have no spans, no breadcrumbs, and no request context.

### Pitfall 2: SENTRY_DSN undefined Causes Silent No-Op
**What goes wrong:** `Sentry.init({ dsn: undefined })` is valid and silently disables Sentry. If `SENTRY_DSN` is not set in production env, all errors are dropped.
**Why it happens:** Sentry treats missing/empty DSN as "run in dry mode" — no error thrown.
**How to avoid:** Add `SENTRY_DSN` to `config.ts` Zod schema as `z.string().optional()` for API. Log a warning at startup if it's absent in production (`NODE_ENV === 'production' && !SENTRY_DSN`). Add it to `docker-compose.yml` environment block.
**Warning signs:** No events appear in Sentry dashboard after deployment.

### Pitfall 3: pino-pretty Pulled Into Production via devDependencies
**What goes wrong:** Dockerfile runs `npm install` without `--omit=dev`, installing pino-pretty. The `NODE_ENV !== 'production'` guard in code is not checked correctly.
**Why it happens:** Existing Dockerfiles already use `RUN npm install --workspace=...` without `--omit=dev`. If pino-pretty is added as a devDependency and the transport code path runs in production, it succeeds (package is there) but was supposed to be absent.
**How to avoid:** (1) Keep pino-pretty as `devDependency` only. (2) Verify Dockerfiles only copy `dist/` (compiled JS) — they do not copy `src/` or `node_modules` from build stage to final stage in the current multi-stage setup. The current Dockerfiles already use a clean multi-stage build that copies only `dist/` — pino-pretty from the build stage devDeps is not present in the final image. (3) The production guard `NODE_ENV !== 'production'` prevents the transport from being referenced even if somehow available.
**Warning signs:** pino-pretty listed in final-stage `node_modules` inside Docker image.

### Pitfall 4: Workers Use console.log — No Structured JSON in Production
**What goes wrong:** Workers output unstructured log lines that log aggregators cannot parse, and PII in console.log output is not redacted.
**Why it happens:** Workers package has no pino dependency — only the API uses Fastify's built-in pino.
**How to avoid:** Add `pino` as a direct dependency to `@twmail/workers` and create a shared `logger.ts`. Replace all `console.log` / `console.error` calls in worker files with the pino logger.
**Warning signs:** Worker container logs are not JSON in production.

### Pitfall 5: Next.js Sentry Missing Server-Side Error Capture
**What goes wrong:** Client errors go to Sentry, but Server Component exceptions, middleware errors, and RSC fetch failures are not captured.
**Why it happens:** `instrumentation-client.ts` only covers the browser runtime. Server-side capture requires `instrumentation.ts` with the `onRequestError` export.
**How to avoid:** Create both files. The `onRequestError` hook (requires Next.js 15+) — this project uses Next.js 16.1.6, so it is supported. Also create `global-error.tsx` in `app/` for React rendering errors.

## Code Examples

Verified patterns from official sources:

### Sentry Init for ESM Node.js
```javascript
// packages/api/src/instrument.mjs
// Source: https://docs.sentry.io/platforms/javascript/guides/node/install/esm/
import * as Sentry from '@sentry/node';

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV ?? 'development',
  tracesSampleRate: 1.0,
  sendDefaultPii: false,
});
```

### Fastify Logger with Pino Redact
```typescript
// Source: https://fastify.dev/docs/latest/Reference/Logging/
// Combined with pino redact: https://github.com/pinojs/pino/blob/main/docs/redaction.md
const app = Fastify({
  logger: {
    level: config.LOG_LEVEL,
    redact: {
      paths: [
        'req.headers.authorization',
        'req.headers.cookie',
        'req.body.email',
        'req.body.password',
      ],
      censor: '[Redacted]',
    },
  },
});
```

### Pino Standalone Logger for Workers
```typescript
// Source: https://getpino.io/
import pino from 'pino';

export const logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  redact: {
    paths: ['*.email', '*.authorization'],
    censor: '[Redacted]',
  },
});
```

### pino-pretty Conditional Guard
```typescript
// Only reference pino-pretty in non-production — never import it unconditionally
const transport =
  process.env.NODE_ENV !== 'production'
    ? { target: 'pino-pretty', options: { translateTime: 'HH:MM:ss Z' } }
    : undefined;
```

### Sentry Fastify Error Handler
```typescript
// Source: https://docs.sentry.io/platforms/javascript/guides/fastify/
import * as Sentry from '@sentry/node';

// Called immediately after Fastify() instantiation, before plugin registration
Sentry.setupFastifyErrorHandler(app);
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `require('./instrument')` before other requires | `node --import ./instrument.mjs` for ESM | Sentry SDK v8 (2024) | ESM apps must use --import flag; require-based approach doesn't work |
| Separate `@sentry/fastify` package | `@sentry/node` + `setupFastifyErrorHandler()` | v8+ unified | No separate Fastify package needed; all in `@sentry/node` |
| `autoDiscoverNodePerformanceMonitoringIntegrations()` | Automatic via OpenTelemetry (removed) | v8 | Just call `Sentry.init()` — all supported frameworks auto-detected |
| pino-noir (separate redaction package) | Pino built-in `redact` option | pino v5 (2019) | No extra package needed; redact is a first-class pino config option |

**Deprecated/outdated:**
- `@sentry/fastify`: Merged into `@sentry/node` — do not install separately
- `requestHandler` / `tracingMiddleware` manual middleware: Removed in v8 — `setupFastifyErrorHandler` replaces both
- `autoDiscoverNodePerformanceMonitoringIntegrations()`: Removed in v8 — auto-instrumentation is always on

## Open Questions

1. **SENTRY_DSN availability at research time**
   - What we know: Sentry project must be created in Sentry.io dashboard to get a DSN
   - What's unclear: Whether a Sentry project for TWMail already exists
   - Recommendation: Make DSN optional in Zod schema (`z.string().optional()`); log a startup warning if absent in production; this way the app works without Sentry configured (development, CI) and fails loudly only in spirit not in crash

2. **Worker console.log volume — full replacement vs targeted**
   - What we know: Workers use `console.log` throughout (see `workers/src/index.ts` — uses console.log for startup messages)
   - What's unclear: Whether all worker files should be fully converted or only error paths
   - Recommendation: Full replacement for consistency with OBS-02 (structured JSON everywhere in production)

3. **Frontend NEXT_PUBLIC_SENTRY_DSN env var — build-time vs runtime**
   - What we know: Next.js requires `NEXT_PUBLIC_*` prefix for client-side env vars, which bakes them into the build
   - What's unclear: Whether frontend is rebuilt per environment or the same image used across environments
   - Recommendation: Use `NEXT_PUBLIC_SENTRY_DSN` as build arg in Dockerfile; document it in docker-compose.yml

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 2.1.x |
| Config file | `packages/api/vitest.config.ts` |
| Quick run command | `npm test --workspace=packages/api` |
| Full suite command | `npm test --workspace=packages/api` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| OBS-01 | Sentry.init called with DSN in API startup | unit (source-code scan) | `vitest run tests/sentry-init.unit.test.ts` | ❌ Wave 0 |
| OBS-01 | `setupFastifyErrorHandler` wired in app.ts | unit (source-code scan) | included above | ❌ Wave 0 |
| OBS-01 | instrument.mjs exists in api + workers | unit (source-code scan) | included above | ❌ Wave 0 |
| OBS-02 | Pino logger has redact paths for email + authorization | unit (source-code scan) | `vitest run tests/pino-redact.unit.test.ts` | ❌ Wave 0 |
| OBS-03 | pino-pretty absent from production logger config path | unit (source-code scan) | included in pino-redact test | ❌ Wave 0 |

Source-code scan tests are the established pattern in this codebase (see `error-shapes.test.ts`, `webhook-auto-disable.unit.test.ts`) — they read source files with `fs.readFileSync` and assert on content without requiring live processes or Sentry credentials.

### Sampling Rate
- **Per task commit:** `npm test --workspace=packages/api -- --reporter=verbose`
- **Per wave merge:** `npm test --workspace=packages/api`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `packages/api/tests/sentry-init.unit.test.ts` — covers OBS-01 (source-code scan for Sentry wiring)
- [ ] `packages/api/tests/pino-redact.unit.test.ts` — covers OBS-02 and OBS-03 (redact config present, pino-pretty absent in production path)

## Sources

### Primary (HIGH confidence)
- Sentry Fastify docs: https://docs.sentry.io/platforms/javascript/guides/fastify/
- Sentry Node ESM docs: https://docs.sentry.io/platforms/javascript/guides/node/install/esm/
- Sentry Next.js manual setup: https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/
- Fastify logging reference: https://fastify.dev/docs/latest/Reference/Logging/
- npm: `@sentry/node` and `@sentry/nextjs` at 10.43.0 (verified via `npm view`)

### Secondary (MEDIUM confidence)
- pino redact docs (GitHub): https://github.com/pinojs/pino/blob/main/docs/redaction.md
- Better Stack pino guide: https://betterstack.com/community/guides/logging/how-to-install-setup-and-use-pino-to-log-node-js-applications/
- pino homepage: https://getpino.io/

### Tertiary (LOW confidence)
- None — all claims verified against official sources

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — versions confirmed via npm, packages are official Sentry SDKs
- Architecture: HIGH — ESM --import pattern confirmed in official Sentry docs; pino redact confirmed in official pino docs; Dockerfile analysis confirmed multi-stage build correctly excludes devDeps
- Pitfalls: HIGH — ESM ordering issue is documented in Sentry migration guide; pino-pretty absent status confirmed by grep of all package.json files

**Research date:** 2026-03-13
**Valid until:** 2026-04-13 (Sentry SDK releases frequently; verify version before install)

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| OBS-01 | Sentry configured for API, workers, and frontend | `@sentry/node` for API+workers via `instrument.mjs` + `setupFastifyErrorHandler`; `@sentry/nextjs` for frontend via `instrumentation.ts` + `instrumentation-client.ts` + `global-error.tsx` |
| OBS-02 | Pino structured logging with PII redaction (emails, JWTs) in production | Fastify's built-in Pino logger accepts a `redact` block; workers need `pino` added as dependency and a standalone `logger.ts` replacing `console.log` calls |
| OBS-03 | pino-pretty removed from production builds | Already absent from all package.json files (confirmed by grep); enforce via `NODE_ENV !== 'production'` guard in logger config and keep as devDependency only |
</phase_requirements>
