import { describe, it, expect } from 'vitest';
import { detectMachineOpen } from '../src/routes/tracking.js';

describe('detectMachineOpen', () => {
  describe('Apple proxy IP detection', () => {
    it('returns true for Apple proxy IP 17.58.0.1', () => {
      expect(detectMachineOpen('17.58.0.1', '')).toBe(true);
    });

    it('returns true for Apple block start 17.0.0.0', () => {
      expect(detectMachineOpen('17.0.0.0', '')).toBe(true);
    });

    it('returns false for non-Apple IP 1.2.3.4', () => {
      expect(detectMachineOpen('1.2.3.4', '')).toBe(false);
    });

    it('returns false for IP starting with 17 but not 17. prefix (170.0.0.1)', () => {
      expect(detectMachineOpen('170.0.0.1', '')).toBe(false);
    });
  });

  describe('proxy user-agent detection', () => {
    it('returns true for YahooMailProxy user-agent', () => {
      expect(detectMachineOpen('1.2.3.4', 'YahooMailProxy/1.0')).toBe(true);
    });

    it('returns true for Googleimageproxy user-agent', () => {
      expect(detectMachineOpen('1.2.3.4', 'Googleimageproxy')).toBe(true);
    });

    it('returns false for normal browser user-agent', () => {
      expect(detectMachineOpen('1.2.3.4', 'Mozilla/5.0 (Windows NT 10.0)')).toBe(false);
    });
  });
});
