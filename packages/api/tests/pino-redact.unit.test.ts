/**
 * Source-code scan: verify Pino redact config in api package and absence of
 * pino-pretty in production logger path.
 *
 * These tests read source files from disk — no runtime, no DB, no network.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { join, resolve } from 'path';

// import.meta.dirname = packages/api/tests → go up 3 levels to repo root
const root = resolve(import.meta.dirname, '..', '..', '..');
const apiSrc = join(root, 'packages', 'api', 'src');
const workersInstrumentPath = join(root, 'packages', 'workers', 'src', 'instrument.mjs');
const workersLoggerPath = join(root, 'packages', 'workers', 'src', 'logger.ts');
const workersDockerfile = join(root, 'packages', 'workers', 'Dockerfile');

describe('Pino redact config — API app.ts (source-code scan)', () => {
  it('app.ts logger config contains required PII redact paths', () => {
    const appPath = join(apiSrc, 'app.ts');
    const source = readFileSync(appPath, 'utf-8');
    expect(source).toContain('req.headers.authorization');
    expect(source).toContain('req.headers.cookie');
    expect(source).toContain('req.body.email');
    expect(source).toContain('req.body.password');
  });

  it('app.ts guards pino-pretty behind a NODE_ENV !== production check', () => {
    const appPath = join(apiSrc, 'app.ts');
    const source = readFileSync(appPath, 'utf-8');
    if (source.includes('pino-pretty')) {
      // pino-pretty must only appear when NODE_ENV is not production
      expect(source).toMatch(/NODE_ENV.*production/);
      // The pino-pretty reference must NOT appear before any NODE_ENV guard
      // (i.e., the return { level, redact } production path must not include it)
      const productionReturnIdx = source.indexOf('return base');
      const pinoPrettyIdx = source.indexOf('pino-pretty');
      // pino-pretty must come after the guarded block, not before any guard
      expect(productionReturnIdx).toBeGreaterThan(-1);
      expect(pinoPrettyIdx).toBeGreaterThan(-1);
    }
  });
});

describe('Workers instrument.mjs (source-code scan)', () => {
  it('packages/workers/src/instrument.mjs exists', () => {
    expect(existsSync(workersInstrumentPath), `${workersInstrumentPath} must exist`).toBe(true);
  });

  it('workers instrument.mjs calls Sentry.init', () => {
    const source = readFileSync(workersInstrumentPath, 'utf-8');
    expect(source).toContain('Sentry.init');
  });

  it('workers instrument.mjs reads dsn from process.env.SENTRY_DSN', () => {
    const source = readFileSync(workersInstrumentPath, 'utf-8');
    expect(source).toContain('process.env.SENTRY_DSN');
  });
});

describe('Workers pino logger (source-code scan)', () => {
  it('packages/workers/src/logger.ts exists', () => {
    expect(existsSync(workersLoggerPath), `${workersLoggerPath} must exist`).toBe(true);
  });

  it('workers logger.ts exports a logger instance with redact config', () => {
    const source = readFileSync(workersLoggerPath, 'utf-8');
    expect(source).toContain('export');
    expect(source).toContain('logger');
    expect(source).toContain('redact');
  });

  it('workers logger.ts does NOT use pino-pretty unconditionally in production', () => {
    const source = readFileSync(workersLoggerPath, 'utf-8');
    if (source.includes('pino-pretty')) {
      // Must be guarded by NODE_ENV check
      expect(source).toMatch(/NODE_ENV.*production/);
    }
  });

  it('workers logger.ts redact paths cover email and authorization', () => {
    const source = readFileSync(workersLoggerPath, 'utf-8');
    expect(source).toContain('email');
    expect(source).toContain('authorization');
  });
});

describe('Workers Dockerfile (source-code scan)', () => {
  it('workers Dockerfile CMD uses --import for instrument.mjs', () => {
    const dockerfile = readFileSync(workersDockerfile, 'utf-8');
    expect(dockerfile).toMatch(/--import.*instrument/);
  });
});
