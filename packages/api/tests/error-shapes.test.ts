import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve, join } from 'node:path';

/**
 * Error shape conformance tests — QUAL-09
 *
 * Asserts that every API error response uses the canonical shape:
 *   { error: { code: string, message: string } }
 *
 * No bare-string error sends are allowed:
 *   { error: 'some string' }  <-- non-conforming, must not exist in any route file
 *
 * Strategy: Source-code scan of all route files — no DB or network required.
 * This catches regressions at the earliest possible point (build/test time).
 */

const ROUTES_DIR = resolve(import.meta.dirname, '../src/routes');

/** Pattern that matches bare-string error sends: reply.send({ error: 'something' }) */
const BARE_STRING_ERROR_RE = /\.send\(\s*\{\s*error\s*:\s*['"`][^'"`]+['"`]\s*\}\s*\)/;

function getRouteFiles(): string[] {
  return readdirSync(ROUTES_DIR)
    .filter((f) => f.endsWith('.ts'))
    .map((f) => join(ROUTES_DIR, f));
}

describe('API error response shape conformance (QUAL-09)', () => {
  const routeFiles = getRouteFiles();

  it('route directory contains at least one file', () => {
    expect(routeFiles.length).toBeGreaterThan(0);
  });

  it('no route file sends { error: "bare string" } — all use { error: { code, message } }', () => {
    const violations: Array<{ file: string; line: number; text: string }> = [];

    for (const filePath of routeFiles) {
      const content = readFileSync(filePath, 'utf-8');
      const lines = content.split('\n');

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]!;
        if (BARE_STRING_ERROR_RE.test(line)) {
          violations.push({ file: filePath, line: i + 1, text: line.trim() });
        }
      }
    }

    if (violations.length > 0) {
      const details = violations.map((v) => `  ${v.file}:${v.line}  →  ${v.text}`).join('\n');
      throw new Error(
        `Found ${violations.length} non-conforming error send(s).\n` +
          `All errors must use { error: { code, message } } shape:\n${details}`,
      );
    }

    expect(violations).toHaveLength(0);
  });

  describe('webhooks-inbound.ts error sends use { code, message } shape', () => {
    const webhooksFile = join(ROUTES_DIR, 'webhooks-inbound.ts');
    const content = readFileSync(webhooksFile, 'utf-8');

    it('SNS signature error response uses canonical shape', () => {
      expect(content).toContain("code: 'INVALID_SNS_SIGNATURE'");
      expect(content).toContain("message: 'Invalid SNS signature'");
    });

    it('SubscribeURL error response uses canonical shape', () => {
      expect(content).toContain("code: 'INVALID_SUBSCRIBE_URL'");
      expect(content).toContain("message: 'Invalid SubscribeURL'");
    });

    it('SNS Message JSON parse error response uses canonical shape', () => {
      expect(content).toContain("code: 'INVALID_SNS_MESSAGE'");
      expect(content).toContain("message: 'Invalid SNS Message JSON'");
    });

    it('no bare-string error sends remain in webhooks-inbound.ts', () => {
      const lines = content.split('\n');
      const violations = lines.filter((line) => BARE_STRING_ERROR_RE.test(line));
      expect(violations).toHaveLength(0);
    });
  });
});
