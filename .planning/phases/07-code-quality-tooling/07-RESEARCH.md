# Phase 7: Code Quality — Tooling - Research

**Researched:** 2026-03-13
**Domain:** ESLint v9 flat config, typescript-eslint v8, Vitest v2, Prettier, husky, lint-staged, npm workspaces monorepo
**Confidence:** HIGH

## Summary

This phase adds automated enforcement tooling to a TypeScript monorepo (npm workspaces) with four packages: `api`, `workers`, `shared`, `frontend`. The monorepo already has Vitest v2.1.9 installed in `@twmail/api` devDependencies and a functioning test suite in `packages/api/tests/`. ESLint v9.39.4 and `@typescript-eslint` v8.57.0 are already installed in the workspace (pulled in transitively via `eslint-config-next` in the frontend). The frontend already has its own `eslint.config.mjs` using the Next.js flat config. What is missing is: a root-level monorepo ESLint flat config covering `api`, `workers`, and `shared`; Prettier with `eslint-config-prettier` integration; a `vitest.config.ts` for `api`; Vitest in `workers` devDependencies; unit tests for SNS handler idempotency and bulk-send deduplication; and husky + lint-staged pre-commit hooks at the root.

The key technical constraint is that all backend packages use `"type": "module"` and `"module": "Node16"` in TypeScript. This requires `.js` extensions in imports and careful Vitest configuration to handle ESM. The `no-floating-promises` rule requires TypeScript type information, meaning ESLint must be configured with `parserOptions: { project: true }` pointing at each package's `tsconfig.json` — which in flat config means using `@typescript-eslint/eslint-plugin` with the typed linting setup.

**Primary recommendation:** Add a root `eslint.config.mjs` using the ESLint v9 flat config API, targeting the three backend packages with typed linting. Add a root `.prettierrc` + `eslint-config-prettier`. Configure Vitest per-package (api already has it running). Add husky + lint-staged at the root. Write unit tests for SNS idempotency, dedup, and segment AND/OR logic as isolated functions — these already have the exported pure functions needed.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| QUAL-01 | ESLint v9 flat config with typescript-eslint v8 configured across monorepo | ESLint v9.39.4 + @typescript-eslint v8.57.0 already installed; need root eslint.config.mjs |
| QUAL-02 | no-floating-promises rule enabled on all async handlers/workers | Requires typed linting (project: true); Fastify route handlers and BullMQ worker callbacks are the primary targets |
| QUAL-03 | Vitest configured with coverage for critical paths | Vitest v2.1.9 installed in api; workers needs it added; no vitest.config.ts exists yet |
| QUAL-04 | Tests for SNS handler idempotency | verifySnsSignature and idempotent insert logic in webhooks-inbound.ts; ON CONFLICT DO NOTHING pattern; requires mocking DB |
| QUAL-05 | Tests for bulk-send deduplication | existingMessage check in bulk-send.worker.ts; requires mocking DB and Redis |
| QUAL-06 | Tests for segment query logic (AND/OR precedence) | resolveSegmentContactIds in @twmail/shared; already exported; pure SQL builder — testable with kysely-test or mock |
| QUAL-07 | lint-staged + husky pre-commit hooks configured | husky v9 + lint-staged v15; neither installed yet; goes in root package.json |
| QUAL-10 | Prettier configured with eslint-config-prettier integration | prettier not yet installed; eslint-config-prettier not yet installed; simple .prettierrc + plugin |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| eslint | v9.39.4 (already installed) | JS/TS linting | Flat config is ESLint v9 default; required for QUAL-01 |
| @typescript-eslint/eslint-plugin | v8.57.0 (already installed) | TypeScript rules including no-floating-promises | The only maintained TS ESLint plugin for v9 flat config |
| @typescript-eslint/parser | v8.57.0 (already installed) | TypeScript AST parsing for ESLint | Required companion to the plugin |
| vitest | v2.1.9 (installed in api) | Test framework | Already adopted; ESM-native; integrates with Vite config system |
| @vitest/coverage-v8 | ^2.1.x | Code coverage via V8 | Native V8 coverage; no Istanbul transform needed for ESM |
| prettier | ^3.x | Code formatting | Standard; does not conflict with ESLint when using eslint-config-prettier |
| eslint-config-prettier | ^9.x | Disables ESLint rules that conflict with Prettier | Required pairing when using both tools |
| husky | ^9.x | Git hooks manager | Standard for Node.js projects; works with npm workspaces |
| lint-staged | ^15.x | Run linters on git staged files only | Fast pre-commit; skips unmodified files |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @vitest/ui | ^2.1.x | Browser-based test UI | Optional; useful for debugging test runs locally |
| vitest-mock-extended | ^2.x | Deep auto-mocking of Kysely/ioredis objects | Simpler than manual mocks for DB/Redis in unit tests |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| @vitest/coverage-v8 | @vitest/coverage-istanbul | V8 is faster and requires no Babel; istanbul supports more environments but not needed here |
| husky + lint-staged | simple-git-hooks | simple-git-hooks is lighter but husky is better documented and has wider adoption |
| eslint-config-prettier | Manual rule disabling | Config-prettier is maintained and exhaustive; manual approach misses new rules |

**Installation (root):**
```bash
npm install --save-dev prettier eslint-config-prettier husky lint-staged --workspace=.
npm install --save-dev @vitest/coverage-v8 --workspace=packages/api
npm install --save-dev vitest @vitest/coverage-v8 --workspace=packages/workers
npx husky init
```

## Architecture Patterns

### Recommended Project Structure
```
twmail/                          # monorepo root
├── eslint.config.mjs            # NEW: root flat config for api, workers, shared
├── .prettierrc                  # NEW: prettier config
├── .prettierignore              # NEW: ignore dist, node_modules
├── .husky/
│   └── pre-commit               # NEW: runs lint-staged
├── package.json                 # add: lint-staged config, husky prepare script
├── packages/
│   ├── api/
│   │   ├── vitest.config.ts     # NEW: vitest config with coverage
│   │   └── tests/
│   │       ├── setup.ts         # EXISTS: integration test setup (keep as-is)
│   │       ├── sns-idempotency.unit.test.ts   # NEW: QUAL-04
│   │       ├── bulk-send-dedup.unit.test.ts   # NEW: QUAL-05
│   │       └── segment-logic.unit.test.ts     # NEW: QUAL-06
│   ├── workers/
│   │   └── vitest.config.ts     # NEW: if workers unit tests needed
│   └── frontend/
│       └── eslint.config.mjs    # EXISTS: keep, already correct
```

### Pattern 1: ESLint v9 Flat Config for Monorepo with Typed Linting

**What:** A single `eslint.config.mjs` at the root targeting backend packages with TypeScript type-aware rules. Frontend already has its own config and must be excluded from the root config.

**When to use:** Any time `no-floating-promises` or other type-dependent rules are required.

**Example:**
```javascript
// Source: https://typescript-eslint.io/getting-started/typed-linting
import tseslint from 'typescript-eslint';
import prettierConfig from 'eslint-config-prettier';

export default tseslint.config(
  // Global ignores — must come first
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      'packages/frontend/**',   // frontend has its own config
    ],
  },
  // Apply to backend packages only
  {
    files: ['packages/api/src/**/*.ts', 'packages/workers/src/**/*.ts', 'packages/shared/src/**/*.ts'],
    extends: [
      ...tseslint.configs.recommendedTypeChecked,
    ],
    languageOptions: {
      parserOptions: {
        // projectService: true is the v8 way — discovers tsconfig.json automatically
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  },
  // Prettier must be last — disables conflicting formatting rules
  prettierConfig,
);
```

**Critical:** `projectService: true` (the v8 API) replaces the old `project: true` approach. It auto-discovers tsconfig.json files from the file being linted. This is what makes `no-floating-promises` work across packages without manually listing every tsconfig path.

### Pattern 2: Vitest Config for ESM + Node.js with Coverage

**What:** Per-package `vitest.config.ts` that handles the `"type": "module"` / Node16 module resolution environment.

**When to use:** Any package with `"type": "module"` and `tsx`/Node.js (not browser) tests.

**Example:**
```typescript
// Source: https://vitest.dev/config/
// packages/api/vitest.config.ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/index.ts', 'src/seed-*.ts'],
      reporter: ['text', 'lcov'],
      thresholds: {
        lines: 70,
        functions: 70,
      },
    },
  },
});
```

**Important:** Do not set `globals: true` unless you add the vitest type shim — the existing tests already import from `vitest` explicitly (`import { describe, it, expect } from 'vitest'`), which is the preferred pattern.

### Pattern 3: Unit Tests Using Exported Pure Functions

**What:** The codebase already exports testable pure functions from route/service files. Tests for QUAL-04/05/06 target these functions directly — no HTTP layer needed.

**Functions already exported and testable without mocks:**
- `detectMachineOpen(ip, ua)` — in `packages/api/src/routes/tracking.ts` (already tested)
- `resolveClickUrl(metadata, hash)` — in `packages/api/src/routes/tracking.ts` (already tested)
- `resolveSegmentContactIds(db, rules)` — in `packages/shared/src/` (SQL builder, needs Kysely mock or real DB)

**Functions requiring mocks for QUAL-04/05:**
- SNS idempotency: The idempotent insert uses `db.insertInto('events').onConflict(...).do(...)` pattern. Test approach: mock the Kysely `db` object to simulate the `numInsertedOrUpdatedRows === 0` path (duplicate) and the `=== 1` path (first insert).
- Bulk-send dedup: The `existingMessage` check is a DB query. Extract the dedup logic into a testable helper or mock `getDb()`.

**The problem:** SNS idempotency and bulk-send dedup logic is embedded inside FastifyPluginAsync/Worker callbacks — not directly exportable without refactoring. QUAL-04 and QUAL-05 need either:
1. **Extract helper functions** (preferred): Extract `handleSnsNotification(db, snsMessage)` and `shouldSkipSend(db, campaignId, contactId)` as exported async functions. Test those directly.
2. **Integration test** (existing approach): Use `app.inject()` to POST to `/inbound/ses` — but this requires a running DB.

Recommendation: **extract and export** the logic for clean unit testing. This is the same pattern used for `detectMachineOpen` and `resolveClickUrl`.

### Pattern 4: husky + lint-staged Configuration

**What:** Pre-commit hook runs lint-staged which runs ESLint + Prettier on staged files only.

**Example:**
```json
// package.json (root)
{
  "scripts": {
    "prepare": "husky"
  },
  "lint-staged": {
    "packages/{api,workers,shared}/src/**/*.ts": [
      "eslint --fix --max-warnings=0",
      "prettier --write"
    ],
    "packages/frontend/**/*.{ts,tsx}": [
      "prettier --write"
    ]
  }
}
```

```bash
# .husky/pre-commit
npx lint-staged
```

**Note on `--max-warnings=0`:** This makes the hook fail if ESLint reports any warnings. Given that `no-floating-promises` should be `'error'`, this is appropriate. Alternatively, omit `--max-warnings=0` and let errors alone fail the commit.

### Anti-Patterns to Avoid

- **Running ESLint with typed linting on `packages/frontend`:** The frontend uses `eslint-config-next` which sets its own parser options. Mixing the root config with the frontend config will produce `parserOptions.project` conflicts. Use `ignores` to exclude `packages/frontend/**` from the root config entirely.
- **Using `project: ['./tsconfig.json']` array style in flat config:** The v8 typescript-eslint uses `projectService: true` instead. The old array style works but is deprecated and doesn't handle monorepo tsconfig discovery well.
- **Configuring vitest globals without type shims:** If `globals: true`, you must add `"types": ["vitest/globals"]` to tsconfig or TypeScript will not know about `describe`, `it`, `expect`. Since existing tests import explicitly, keep `globals: false`.
- **Running full test suite in pre-commit hook:** Pre-commit should only run lint and format — not tests. Tests are slow and block commits. Tests belong in CI.
- **Using `eslint --ext .ts` (v8 CLI syntax) with ESLint v9:** The `--ext` flag is removed in v9. File targeting is done in `eslint.config.mjs` via `files` globs.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Disabling formatting rules in ESLint | Manual rule list | eslint-config-prettier | Prettier adds new rules; the config is maintained to stay current |
| Git pre-commit hook script | Custom bash hook | husky + lint-staged | lint-staged handles staged-file-only filtering; husky handles hook installation across team |
| TypeScript-aware linting | Custom rule | @typescript-eslint/no-floating-promises | Promise tracking across async call graphs is complex; the rule handles Fastify's reply chains correctly |
| Code coverage | Custom reporters | @vitest/coverage-v8 | V8 coverage is built into Node.js; no instrumentation overhead |

**Key insight:** The `no-floating-promises` rule requires the full TypeScript type checker running under ESLint. This is non-trivial to configure correctly (especially in a monorepo). Using `projectService: true` is the current standard and avoids manual tsconfig path management.

## Common Pitfalls

### Pitfall 1: `no-floating-promises` False Positives on Fastify Route Handlers

**What goes wrong:** Fastify's `app.get(path, handler)` returns a `Promise` from the handler. With `no-floating-promises`, calling `app.get(...)` itself may be flagged as a floating promise because the plugin registration function (`FastifyPluginAsync`) is an async function and the `app.get()` call result is not awaited.

**Why it happens:** `app.get()`, `app.post()` etc. in Fastify v5 return `FastifyInstance`, not a Promise. The handlers registered *inside* are async, but the route registration itself is synchronous. The issue only arises when developers write `someAsyncFunction()` without `await` inside a route handler body.

**How to avoid:** Run ESLint with typed linting against the actual codebase and audit the output. The tracking route already uses the correct fire-and-forget pattern: `recordOpen(db, messageId, request).catch((err) => {...})` — this is not a floating promise because `.catch()` is chained. Only bare `asyncFn()` calls without `await` or `.catch()` are flagged.

**Warning signs:** If `no-floating-promises` reports errors on `app.get(...)` lines themselves, the parser is not correctly resolving Fastify types — check `parserOptions.projectService` and `skipLibCheck`.

### Pitfall 2: ESM + Vitest Config Resolution

**What goes wrong:** Vitest fails with `ERR_UNKNOWN_FILE_EXTENSION` or cannot resolve `.js` imports in test files.

**Why it happens:** The packages use `"type": "module"` + `"module": "Node16"` in tsconfig. Vitest needs to know it's in an ESM environment. Without a `vitest.config.ts`, Vitest uses heuristics which may not match.

**How to avoid:** Add explicit `vitest.config.ts` per package. The `environment: 'node'` setting is correct for all backend packages. Do not set `resolve.extensions` — the `.js` imports in source are intentional for Node16 ESM and Vitest handles them correctly.

**Warning signs:** Test imports fail with module resolution errors on `.js` extensions.

### Pitfall 3: lint-staged Runs ESLint Without Type Information

**What goes wrong:** `no-floating-promises` silently does nothing (no errors, no checks) when running ESLint from lint-staged because the staged files are passed to ESLint individually, breaking the TypeScript project service's ability to find `tsconfig.json`.

**Why it happens:** lint-staged passes filenames as CLI arguments. The `projectService: true` option in typescript-eslint normally discovers tsconfig.json by walking up from the file being linted. When files are passed individually this usually still works, but the working directory must be the monorepo root.

**How to avoid:** Run lint-staged from the repo root (default). Ensure the `eslint` command in lint-staged does not use `--no-project` or similar flags. Test with `npx eslint packages/api/src/routes/tracking.ts` from the root and verify `no-floating-promises` fires on a test file with a bare async call.

**Warning signs:** ESLint in lint-staged exits 0 even when you intentionally add a floating promise to a staged file.

### Pitfall 4: Prettier Conflicts with typescript-eslint Formatting Rules

**What goes wrong:** After adding Prettier, `eslint --fix` and `prettier --write` fight over the same file, producing different outputs on alternating runs.

**Why it happens:** `tseslint.configs.recommendedTypeChecked` includes some stylistic rules (e.g., `@typescript-eslint/indent`) that overlap with Prettier.

**How to avoid:** Place `prettierConfig` (from `eslint-config-prettier`) as the **last** item in the `tseslint.config(...)` array. This disables all conflicting ESLint rules and lets Prettier own formatting. Never use `eslint-plugin-prettier` (deprecated pattern).

**Warning signs:** Running `eslint --fix` then `prettier --write` on the same file produces a different result than running them in the opposite order.

### Pitfall 5: Unit Tests for Workers Need Vitest Added to Workers Package

**What goes wrong:** Attempting to run vitest in `packages/workers` fails because vitest is not in its devDependencies.

**Why it happens:** Workers package currently has no test tooling — only `tsx` and `typescript`.

**How to avoid:** Add `vitest` and `@vitest/coverage-v8` to `packages/workers/devDependencies`. Add `"test": "vitest run"` script. QUAL-04 and QUAL-05 tests may live in `packages/api/tests/` (since the SNS handler and dedup logic is in the API) or in `packages/workers/tests/` (for bulk-send worker). Recommend keeping all new unit tests in `packages/api/tests/` unless the function lives in workers.

## Code Examples

Verified patterns from official sources:

### ESLint v9 Flat Config with typescript-eslint projectService
```javascript
// Source: https://typescript-eslint.io/getting-started/typed-linting
import tseslint from 'typescript-eslint';
import prettierConfig from 'eslint-config-prettier';

export default tseslint.config(
  { ignores: ['**/dist/**', '**/node_modules/**', 'packages/frontend/**'] },
  {
    files: ['packages/api/src/**/*.ts', 'packages/workers/src/**/*.ts', 'packages/shared/src/**/*.ts'],
    extends: [...tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unsafe-assignment': 'warn',
    },
  },
  prettierConfig,
);
```

### Vitest Config (packages/api/vitest.config.ts)
```typescript
// Source: https://vitest.dev/config/
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/index.ts', 'src/seed-*.ts'],
      reporter: ['text', 'lcov'],
    },
  },
});
```

### SNS Idempotency Unit Test Approach (QUAL-04)

The SNS idempotency is currently implemented as an `ON CONFLICT DO NOTHING` insert in `webhooks-inbound.ts`. To unit test it, extract the notification handler:

```typescript
// Extract from webhooks-inbound.ts into a testable function:
export async function processBounceSnsEvent(
  db: Kysely<Database>,
  messageId: string,
  email: string,
  bounceType: string,
): Promise<{ inserted: boolean }> {
  const result = await db
    .insertInto('events')
    .values({ message_id: messageId, type: EventType.BOUNCE, ... })
    .onConflict((oc) => oc.column('sns_message_id').doNothing())
    .executeTakeFirst();
  return { inserted: (result?.numInsertedOrUpdatedRows ?? 0n) > 0n };
}

// Test:
it('returns inserted=false when SNS message is a duplicate', async () => {
  const db = mockDeep<Kysely<Database>>();
  db.insertInto.mockReturnValue({
    values: vi.fn().mockReturnValue({
      onConflict: vi.fn().mockReturnValue({
        executeTakeFirst: vi.fn().mockResolvedValue({ numInsertedOrUpdatedRows: 0n }),
      }),
    }),
  } as any);
  const result = await processBounceSnsEvent(db, 'msg-1', 'test@example.com', 'Permanent');
  expect(result.inserted).toBe(false);
});
```

### Bulk-Send Dedup Unit Test Approach (QUAL-05)

```typescript
// Extract from bulk-send.worker.ts:
export async function shouldSkipSend(
  db: Kysely<Database>,
  campaignId: number,
  contactId: number,
): Promise<boolean> {
  const existing = await db
    .selectFrom('messages')
    .select('id')
    .where('campaign_id', '=', campaignId)
    .where('contact_id', '=', contactId)
    .executeTakeFirst();
  return existing !== undefined;
}

// Test:
it('returns true when message already exists', async () => {
  const db = mockDeep<Kysely<Database>>();
  // configure mock to return an existing row
  expect(await shouldSkipSend(db, 1, 42)).toBe(true);
});
```

### lint-staged + husky (root package.json additions)
```json
{
  "scripts": {
    "prepare": "husky",
    "lint": "eslint packages/api/src packages/workers/src packages/shared/src",
    "format": "prettier --write \"packages/{api,workers,shared}/src/**/*.ts\""
  },
  "lint-staged": {
    "packages/{api,workers,shared}/src/**/*.ts": [
      "eslint --max-warnings=0",
      "prettier --write"
    ]
  }
}
```

```bash
# .husky/pre-commit
npx lint-staged
```

### .prettierrc (root)
```json
{
  "semi": true,
  "singleQuote": true,
  "tabWidth": 2,
  "trailingComma": "all",
  "printWidth": 120
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `.eslintrc.json` / `.eslintrc.js` | `eslint.config.mjs` (flat config) | ESLint v9 (2024) | No more extends arrays by string name; everything is imported |
| `@typescript-eslint/parser` + `@typescript-eslint/eslint-plugin` configured separately | `typescript-eslint` unified package with `tseslint.config()` helper | typescript-eslint v7+ | Single import, cleaner configuration |
| `project: ['./tsconfig.json', './packages/*/tsconfig.json']` | `projectService: true` | typescript-eslint v7+ | Auto-discovery; no manual path management |
| `eslint-plugin-prettier` | `eslint-config-prettier` only | 2022+ | Plugin ran Prettier as ESLint rule (slow, confusing output); config approach just disables conflicting rules |
| `.huskyrc` / husky v4 | `.husky/` directory + husky v9 | husky v9 (2024) | Simpler shell scripts, no JSON config |

**Deprecated/outdated:**
- `@typescript-eslint/eslint-plugin` and `@typescript-eslint/parser` as separate packages: Still work, but the unified `typescript-eslint` package is preferred
- `eslint --ext .ts`: Removed in ESLint v9; use `files` glob in config instead
- `eslint-plugin-prettier`: Deprecated; use `eslint-config-prettier` + run Prettier separately

## Open Questions

1. **Segment AND/OR Logic Tests (QUAL-06) — Integration vs Unit**
   - What we know: `resolveSegmentContactIds` in `@twmail/shared` builds SQL with Kysely. It's the authoritative logic. The existing `tests/segments.test.ts` tests it via HTTP (integration, requires DB).
   - What's unclear: Can `resolveSegmentContactIds` be tested with a Kysely mock that captures the generated SQL string, or does it need a real DB to verify the AND/OR precedence produces correct results?
   - Recommendation: Use the existing integration test pattern (it already exercises AND/OR via `segments.test.ts`). Add a dedicated `segment-logic.unit.test.ts` that tests the SQL builder output using Kysely's `compile()` method to assert the generated SQL string has correct parenthesization — no DB required.

2. **Workers Package — Are Worker Unit Tests Needed in Phase 7?**
   - What we know: QUAL-05 (bulk-send dedup) logic lives in `packages/workers/src/workers/bulk-send.worker.ts`. Workers currently has no test infrastructure.
   - What's unclear: Whether to extract and test in `packages/api/tests/` (easier, api already has vitest) or set up vitest in workers.
   - Recommendation: Add vitest to workers and write the test there — it tests the worker's own code and creates the right pattern for future worker tests.

3. **Frontend ESLint Integration**
   - What we know: Frontend has its own `eslint.config.mjs` using `eslint-config-next`. Root config must exclude it.
   - What's unclear: Whether lint-staged should also run `next lint` on frontend files as part of the pre-commit hook.
   - Recommendation: Keep frontend out of scope for Phase 7. Frontend already has its own lint config; QUAL-01 and QUAL-02 are focused on backend async handler safety.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest v2.1.9 |
| Config file | `packages/api/vitest.config.ts` (Wave 0 — does not exist yet) |
| Quick run command | `npm test --workspace=packages/api -- --run` |
| Full suite command | `npm test --workspace=packages/api` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| QUAL-01 | ESLint exits 0 across monorepo | lint check | `npx eslint packages/api/src packages/workers/src packages/shared/src` | ❌ Wave 0: needs eslint.config.mjs |
| QUAL-02 | no-floating-promises blocks bare async calls | lint check | `npx eslint packages/api/src --max-warnings=0` | ❌ Wave 0: needs eslint.config.mjs |
| QUAL-03 | Vitest coverage reports for critical paths | unit | `npm test --workspace=packages/api -- --coverage` | ❌ Wave 0: needs vitest.config.ts |
| QUAL-04 | SNS idempotency: duplicate SNS message returns inserted=false | unit | `npm test --workspace=packages/api -- --run tests/sns-idempotency.unit.test.ts` | ❌ Wave 0 |
| QUAL-05 | Bulk-send dedup: existing message record causes skip | unit | `npm test --workspace=packages/workers -- --run tests/bulk-send-dedup.unit.test.ts` | ❌ Wave 0 |
| QUAL-06 | Segment AND/OR: compiled SQL has correct precedence | unit | `npm test --workspace=packages/api -- --run tests/segment-logic.unit.test.ts` | ❌ Wave 0 |
| QUAL-07 | Pre-commit hook blocks bad commits | manual smoke | Attempt `git commit` with a floating promise staged | ❌ Wave 0: needs husky setup |
| QUAL-10 | Prettier format consistent; no ESLint conflict | lint check | `npx prettier --check packages/{api,workers,shared}/src` | ❌ Wave 0: needs .prettierrc |

### Sampling Rate
- **Per task commit:** `npm test --workspace=packages/api -- --run`
- **Per wave merge:** `npm test --workspace=packages/api && npm test --workspace=packages/workers`
- **Phase gate:** Full suite green + `npx eslint` exits 0 + `npx prettier --check` exits 0 before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `packages/api/vitest.config.ts` — required for coverage (QUAL-03)
- [ ] `packages/workers/vitest.config.ts` — required for worker unit tests (QUAL-05)
- [ ] `packages/workers/package.json` — add `vitest`, `@vitest/coverage-v8`, `"test"` script
- [ ] `eslint.config.mjs` (root) — covers QUAL-01, QUAL-02
- [ ] `.prettierrc` (root) + `.prettierignore` — covers QUAL-10
- [ ] `.husky/pre-commit` — covers QUAL-07
- [ ] `packages/api/tests/sns-idempotency.unit.test.ts` — covers QUAL-04
- [ ] `packages/api/tests/bulk-send-dedup.unit.test.ts` OR `packages/workers/tests/bulk-send-dedup.unit.test.ts` — covers QUAL-05
- [ ] `packages/api/tests/segment-logic.unit.test.ts` — covers QUAL-06
- [ ] Install: `prettier eslint-config-prettier husky lint-staged @vitest/coverage-v8`

## Sources

### Primary (HIGH confidence)
- https://typescript-eslint.io/getting-started/typed-linting — projectService: true, flat config setup, no-floating-promises
- https://eslint.org/docs/latest/use/configure/configuration-files — ESLint v9 flat config API, globalIgnores
- https://vitest.dev/config/ — vitest.config.ts options, coverage provider configuration
- https://prettier.io/docs/en/install.html — eslint-config-prettier integration
- Direct codebase inspection — confirmed versions: eslint v9.39.4, @typescript-eslint v8.57.0, vitest v2.1.9 already installed

### Secondary (MEDIUM confidence)
- https://typicode.github.io/husky/ — husky v9 setup (prepare script, .husky/ directory)
- https://github.com/okonet/lint-staged — lint-staged v15 configuration patterns

### Tertiary (LOW confidence)
- Community patterns for Kysely mock testing — needs validation against actual Kysely mock API

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — confirmed from node_modules inspection; versions verified
- Architecture: HIGH — flat config API verified from official typescript-eslint docs
- Pitfalls: HIGH — pitfalls 1-4 from official docs and known ESLint v9 migration issues; pitfall 5 from direct codebase inspection
- Test approach for QUAL-04/05: MEDIUM — depends on whether SNS/dedup logic can be extracted cleanly; extraction approach is standard but requires code change

**Research date:** 2026-03-13
**Valid until:** 2026-06-13 (ESLint v9 + typescript-eslint v8 are stable; unlikely to change)
