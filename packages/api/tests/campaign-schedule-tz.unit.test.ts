/**
 * Unit test: Timezone conversion correctness in campaign scheduling.
 *
 * Verifies that:
 * 1. ISO 8601 strings with timezone offsets are correctly converted to UTC
 * 2. The campaigns.service.ts uses new Date(data.scheduled_at) for conversion
 * 3. The Zod schema enforces datetime format (z.string().datetime())
 *
 * No DB connection required.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const serviceSource = readFileSync(
  resolve(__dirname, '../src/services/campaigns.service.ts'),
  'utf-8',
);

const routeSource = readFileSync(
  resolve(__dirname, '../src/routes/campaigns.ts'),
  'utf-8',
);

describe('Campaign scheduling timezone conversion', () => {
  describe('Date constructor UTC conversion', () => {
    it('converts +11:00 offset ISO string to correct UTC datetime', () => {
      const result = new Date('2026-03-14T09:00:00+11:00').toISOString();
      expect(result).toBe('2026-03-13T22:00:00.000Z');
    });

    it('converts Z suffix ISO string correctly (no offset)', () => {
      const result = new Date('2026-03-14T09:00:00Z').toISOString();
      expect(result).toBe('2026-03-14T09:00:00.000Z');
    });

    it('converts +10:00 offset ISO string to correct UTC datetime (DST difference)', () => {
      // AEST (UTC+10) in winter — no DST for AEDT
      const result = new Date('2026-06-15T09:00:00+10:00').toISOString();
      expect(result).toBe('2026-06-14T23:00:00.000Z');
    });
  });

  describe('campaigns.service.ts source-code verification', () => {
    it('uses new Date(data.scheduled_at) for UTC conversion', () => {
      expect(serviceSource).toContain('new Date(data.scheduled_at)');
    });
  });

  describe('campaigns route Zod schema verification', () => {
    it('enforces datetime format with z.string().datetime()', () => {
      expect(routeSource).toContain('z.string().datetime()');
    });

    it('applies the schema to scheduled_at field', () => {
      expect(routeSource).toContain('scheduled_at');
      // The schema object must contain scheduled_at with datetime validation
      expect(routeSource).toMatch(/scheduled_at.*z\.string\(\)\.datetime\(\)/s);
    });
  });
});
