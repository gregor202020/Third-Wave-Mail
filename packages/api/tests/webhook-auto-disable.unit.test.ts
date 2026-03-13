import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Structural verification: webhook auto-disable logic (OPS-07)
 *
 * Uses source-code scan to verify that webhook.worker.ts contains the correct
 * logic for disabling endpoints after 50 consecutive failures and resetting the
 * failure counter on success.
 *
 * No Redis or DB connection required. Catches threshold regressions at test time.
 */

const WEBHOOK_WORKER_PATH = resolve(
  import.meta.dirname,
  '../../workers/src/workers/webhook.worker.ts',
);

describe('webhook worker auto-disable logic (OPS-07)', () => {
  const source = readFileSync(WEBHOOK_WORKER_PATH, 'utf-8');

  it('source file exists and is non-empty', () => {
    expect(source.length).toBeGreaterThan(0);
  });

  it('disables endpoint when failure_count reaches 50 (>= 50 check)', () => {
    expect(source).toContain('failure_count >= 50');
  });

  it('sets active: false when disabling the endpoint', () => {
    expect(source).toContain('active: false');
  });

  it('resets failure_count to 0 on successful delivery', () => {
    // The success path sets { failure_count: 0, ... }
    expect(source).toMatch(/failure_count\s*:\s*0/);
  });

  it('increments failure_count on error using expression builder', () => {
    // The failure path uses eb('failure_count', '+', 1)
    expect(source).toMatch(/failure_count.*\+.*1/);
  });
});
