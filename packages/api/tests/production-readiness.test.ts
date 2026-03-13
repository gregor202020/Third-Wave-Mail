import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(__dirname, '..', '..', '..');

function readFile(relativePath: string): string {
  const fullPath = resolve(ROOT, relativePath);
  if (!existsSync(fullPath)) {
    throw new Error(`File not found: ${relativePath}`);
  }
  return readFileSync(fullPath, 'utf-8');
}

describe('Production Readiness - Source Code Scan', () => {
  describe('SES DNS verification script', () => {
    it('scripts/verify-ses-dns.ts exists and contains GetEmailIdentityCommand', () => {
      const src = readFile('scripts/verify-ses-dns.ts');
      expect(src).toContain('GetEmailIdentityCommand');
    });

    it('checks SPF via dns.resolveTxt', () => {
      const src = readFile('scripts/verify-ses-dns.ts');
      expect(src).toMatch(/dns.*resolveTxt|resolveTxt/);
    });

    it('checks DMARC and verifies p=quarantine or p=reject', () => {
      const src = readFile('scripts/verify-ses-dns.ts');
      expect(src).toContain('_dmarc');
      expect(src).toMatch(/p=quarantine|p=reject/);
    });
  });

  describe('.env.example', () => {
    it('contains SES_SENDING_DOMAIN placeholder', () => {
      const src = readFile('.env.example');
      expect(src).toContain('SES_SENDING_DOMAIN');
    });

    it('contains UPTIME_MONITOR_URL placeholder', () => {
      const src = readFile('.env.example');
      expect(src).toContain('UPTIME_MONITOR_URL');
    });
  });

  describe('Health endpoint', () => {
    it('health.ts checks both database and redis connectivity', () => {
      const src = readFile('packages/api/src/routes/health.ts');
      expect(src).toMatch(/getDb/);
      expect(src).toMatch(/getRedis/);
    });
  });

  describe('Health check script', () => {
    it('scripts/check-health.sh exists and curls the /health endpoint', () => {
      const src = readFile('scripts/check-health.sh');
      expect(src).toContain('/health');
      expect(src).toContain('curl');
    });
  });
});
