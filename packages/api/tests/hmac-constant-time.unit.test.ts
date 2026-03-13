import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Unit tests for HMAC verification utility (OPS-06)
 *
 * Verifies that verifyHmacSignature:
 * - Returns true for a valid matching signature
 * - Returns false for an invalid signature
 * - Returns false (not throws) for different-length signature
 * - Uses crypto.timingSafeEqual (source-code scan confirms import)
 */

describe('verifyHmacSignature (OPS-06)', () => {
  it('returns true for a valid matching signature', async () => {
    const { verifyHmacSignature } = await import('../src/utils/hmac.js');
    const { createHmac } = await import('crypto');

    const secret = 'test-secret';
    const body = '{"event":"email.sent"}';
    const hex = createHmac('sha256', secret).update(body).digest('hex');
    const validSig = `sha256=${hex}`;

    expect(verifyHmacSignature(secret, body, validSig)).toBe(true);
  });

  it('returns false for an invalid (wrong) signature', async () => {
    const { verifyHmacSignature } = await import('../src/utils/hmac.js');

    const secret = 'test-secret';
    const body = '{"event":"email.sent"}';
    const wrongSig = 'sha256=' + 'a'.repeat(64);

    expect(verifyHmacSignature(secret, body, wrongSig)).toBe(false);
  });

  it('returns false (not throws) for a shorter-length signature', async () => {
    const { verifyHmacSignature } = await import('../src/utils/hmac.js');

    const secret = 'test-secret';
    const body = '{"event":"email.sent"}';
    const shortSig = 'sha256=abc123';

    expect(() => verifyHmacSignature(secret, body, shortSig)).not.toThrow();
    expect(verifyHmacSignature(secret, body, shortSig)).toBe(false);
  });

  it('returns false (not throws) for an empty signature', async () => {
    const { verifyHmacSignature } = await import('../src/utils/hmac.js');

    const secret = 'test-secret';
    const body = '{"event":"email.sent"}';

    expect(() => verifyHmacSignature(secret, body, '')).not.toThrow();
    expect(verifyHmacSignature(secret, body, '')).toBe(false);
  });

  it('source-code confirms timingSafeEqual import (prevents timing attack)', () => {
    const hmacPath = resolve(import.meta.dirname, '../src/utils/hmac.ts');
    const source = readFileSync(hmacPath, 'utf-8');

    expect(source).toContain('timingSafeEqual');
    expect(source).toMatch(/from ['"]crypto['"]/);
  });
});
