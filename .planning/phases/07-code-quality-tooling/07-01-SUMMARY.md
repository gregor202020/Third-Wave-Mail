---
phase: 07-code-quality-tooling
plan: 01
subsystem: infra
tags: [eslint, prettier, husky, lint-staged, typescript-eslint, code-quality]

# Dependency graph
requires:
  - phase: 06-infrastructure-security
    provides: backend packages (api, workers, shared) with stable TS code
provides:
  - ESLint v9 flat config with typed linting (no-floating-promises as error)
  - Prettier formatting enforced across all backend source files
  - husky + lint-staged pre-commit hook blocking commits with lint errors
affects: [08-strict-types, all future development phases]

# Tech tracking
tech-stack:
  added: [prettier@3.x, eslint-config-prettier, husky@9.x, lint-staged@16.x, typescript-eslint@8.x (promoted to root)]
  patterns: [ESLint v9 flat config API with projectService:true, eslint-config-prettier as last config entry]

key-files:
  created:
    - eslint.config.mjs
    - .prettierrc
    - .prettierignore
    - .husky/pre-commit
  modified:
    - package.json (lint/format/format:check/prepare scripts + lint-staged config)
    - packages/api/src/index.ts (void shutdown() fix)
    - packages/workers/src/index.ts (void shutdown() fix)
    - packages/workers/src/scheduler.ts (void poll() in setInterval fix)
    - 40+ backend source files (Prettier formatting applied)

key-decisions:
  - "no-misused-promises set to error alongside no-floating-promises — same class of async bug, both must be errors"
  - "no-unsafe-*, require-await, no-unnecessary-type-assertion downgraded to warn — Phase 8 handles strict type safety"
  - "void operator used for process.on callbacks and setInterval(poll) — fire-and-forget semantics preserved without await"
  - "lint-staged --max-warnings=0 means any ESLint warning in staged files blocks commit — intentional enforcement for new code"
  - "Frontend package excluded from ESLint config (packages/frontend/**) — has its own eslint.config.mjs via Next.js"

patterns-established:
  - "Pattern 1: async entry-point top-level calls use void main() or main().catch() — never bare await"
  - "Pattern 2: process.on signal handlers use () => void asyncFn() — prevents Promise leak into void callback"
  - "Pattern 3: setInterval callbacks wrapping async functions use () => void asyncFn() — consistent with signal handler pattern"
  - "Pattern 4: eslint.config.mjs uses tseslint.config() builder API with projectService:true and prettierConfig as last entry"

requirements-completed: [QUAL-01, QUAL-02, QUAL-07, QUAL-10]

# Metrics
duration: 25min
completed: 2026-03-13
---

# Phase 07 Plan 01: ESLint + Prettier + Pre-commit Hooks Summary

**ESLint v9 flat config with typed linting (no-floating-promises enforced as error), Prettier formatting applied to all backend TS, and husky+lint-staged pre-commit hook blocking async bugs from re-entering the codebase**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-03-13T01:10:00Z
- **Completed:** 2026-03-13T01:35:00Z
- **Tasks:** 2
- **Files modified:** 45+

## Accomplishments
- ESLint v9 flat config (`eslint.config.mjs`) with `typescript-eslint` typed linting targeting api/workers/shared packages — `no-floating-promises` and `no-misused-promises` set to error
- Prettier configured (`.prettierrc`, `.prettierignore`) and applied to all 52 backend source files — zero formatting conflicts with ESLint via `eslint-config-prettier`
- Fixed 6 pre-existing async bugs: bare `main()` call in api index, `process.on` signal handlers in api and workers index files, and `setInterval(poll)` in scheduler — all changed to use `void` operator
- husky pre-commit hook running `lint-staged` — verified to block commits with floating-promise errors

## Task Commits

Each task was committed atomically:

1. **Task 1: Install dependencies and configure ESLint + Prettier** - `7e3d5e8` (feat)
2. **Task 2: Configure husky + lint-staged pre-commit hooks** - `70facb8` (feat)

**Plan metadata:** (to be added with final docs commit)

## Files Created/Modified

### Created
- `eslint.config.mjs` - Root ESLint v9 flat config with typescript-eslint projectService typed linting
- `.prettierrc` - Prettier config (singleQuote, 120 printWidth, trailingComma all)
- `.prettierignore` - Ignore dist, node_modules, .next, coverage
- `.husky/pre-commit` - Pre-commit hook running `npx lint-staged`

### Modified
- `package.json` - Added lint/format/format:check/prepare scripts and lint-staged config
- `packages/api/src/index.ts` - Fixed: `void shutdown()` in process.on, `void main()` at call site
- `packages/workers/src/index.ts` - Fixed: `void shutdown()` in process.on handlers
- `packages/workers/src/scheduler.ts` - Fixed: `() => void poll()` wrapper in setInterval
- 40+ backend source files in api/workers/shared - Prettier formatting applied

## Decisions Made
- `no-misused-promises` added as error alongside `no-floating-promises` — same class of async unsafety
- Phase 8 scoped rules (`no-unsafe-*`, `require-await`, `no-unnecessary-type-assertion`) downgraded to warn — avoids forcing premature type refactors before the dedicated phase
- `void` operator chosen over adding `await` in signal handler callbacks — correct pattern for fire-and-forget lifecycle management where caller doesn't wait for graceful shutdown completion
- `lint-staged --max-warnings=0` flag intentionally strict — forces developers to fix any new warnings in code they're committing without requiring zero warnings in the entire codebase

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed no-misused-promises on process.on signal handlers (api + workers)**
- **Found during:** Task 1 (ESLint run)
- **Issue:** `process.on('SIGTERM', () => shutdown('SIGTERM'))` — async `shutdown` returning Promise in a void callback context
- **Fix:** Changed to `() => void shutdown('SIGTERM')` in api/src/index.ts and workers/src/index.ts
- **Files modified:** packages/api/src/index.ts, packages/workers/src/index.ts
- **Verification:** ESLint exits 0 with no errors after fix
- **Committed in:** 7e3d5e8 (Task 1 commit)

**2. [Rule 1 - Bug] Fixed no-floating-promises on bare main() call in api/src/index.ts**
- **Found during:** Task 1 (ESLint run)
- **Issue:** `main()` at line 29 — async function call with no await, void, or catch
- **Fix:** Changed to `void main()`
- **Files modified:** packages/api/src/index.ts
- **Verification:** ESLint exits 0 with no errors after fix
- **Committed in:** 7e3d5e8 (Task 1 commit)

**3. [Rule 1 - Bug] Fixed no-misused-promises on setInterval(poll) in scheduler.ts**
- **Found during:** Task 1 (ESLint run)
- **Issue:** `setInterval(poll, 60_000)` — `poll` is async, setInterval callback receives Promise
- **Fix:** Changed to `setInterval(() => void poll(), 60_000)`
- **Files modified:** packages/workers/src/scheduler.ts
- **Verification:** ESLint exits 0 with no errors after fix
- **Committed in:** 7e3d5e8 (Task 1 commit)

**4. [Rule 1 - Bug] Downgraded 7 extra recommendedTypeChecked rules from error to warn**
- **Found during:** Task 1 (initial ESLint run with recommendedTypeChecked)
- **Issue:** Rules like `no-unsafe-call`, `no-unsafe-member-access`, `require-await`, `no-unnecessary-type-assertion` were errors — hundreds of violations in existing code outside Phase 7 scope
- **Fix:** Added explicit `'warn'` overrides for all unsafe-* and type-assertion rules in eslint.config.mjs
- **Files modified:** eslint.config.mjs
- **Verification:** ESLint drops from 519 errors to 0 errors; Phase 8 will promote these to errors
- **Committed in:** 7e3d5e8 (Task 1 commit)

---

**Total deviations:** 4 auto-fixed (3 Rule 1 async bugs, 1 Rule 1 config correction)
**Impact on plan:** All fixes necessary for ESLint to exit 0 as required. The rule downgrade is intentional phasing — no scope creep.

## Issues Encountered
- `npm install --save-dev ... -w .` failed (workspace flag doesn't work for root). Used `npm install --save-dev` without `-w` flag — installs to root package.json as expected.
- API test suite fails with `password authentication failed for user "twmail"` — pre-existing infrastructure issue, PostgreSQL not running in dev environment. Unrelated to Phase 7 changes.

## Next Phase Readiness
- Phase 8 (strict types): ESLint config already has the unsafe-* rules as `warn` — Phase 8 simply promotes them to `error` and fixes violations
- Pre-commit hooks active from this point forward — all new code committed to api/workers/shared must pass ESLint + Prettier
- Frontend ESLint config completely untouched

---
*Phase: 07-code-quality-tooling*
*Completed: 2026-03-13*
