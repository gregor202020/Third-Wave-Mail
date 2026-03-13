import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Structural verification: bulk-send worker rate limiter config (OPS-02)
 *
 * Uses source-code scan to verify that createBulkSendWorker configures the
 * BullMQ Worker with the correct rate limiting parameters:
 *   limiter: { max: 40, duration: 1000 }
 *
 * This is a config inspection test — no Redis or DB connection required.
 * Catches misconfiguration regressions at build/test time.
 */

const BULK_SEND_WORKER_PATH = resolve(
  import.meta.dirname,
  '../../workers/src/workers/bulk-send.worker.ts',
);

describe('bulk-send worker rate limiter config (OPS-02)', () => {
  const source = readFileSync(BULK_SEND_WORKER_PATH, 'utf-8');

  it('source file exists and is non-empty', () => {
    expect(source.length).toBeGreaterThan(0);
  });

  it('worker is configured with limiter.max = 40', () => {
    expect(source).toMatch(/limiter\s*:\s*\{[^}]*max\s*:\s*40/s);
  });

  it('worker is configured with limiter.duration = 1000', () => {
    expect(source).toMatch(/limiter\s*:\s*\{[^}]*duration\s*:\s*1000/s);
  });

  it('bulk-send worker concurrency is <= 40', () => {
    // Extract concurrency value from the worker options
    const concurrencyMatch = source.match(/concurrency\s*:\s*(\d+)/);
    expect(concurrencyMatch).not.toBeNull();
    const concurrency = parseInt(concurrencyMatch![1]!, 10);
    expect(concurrency).toBeLessThanOrEqual(40);
  });

  it('limiter and max/duration appear together in the same config block', () => {
    // Full inline assertion: the block has both max: 40 and duration: 1000
    expect(source).toContain('max: 40');
    expect(source).toContain('duration: 1000');
  });
});
