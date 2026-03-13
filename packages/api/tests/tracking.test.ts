import { describe, it, expect } from 'vitest';
import { detectMachineOpen, resolveClickUrl } from '../src/routes/tracking.js';

// ---------------------------------------------------------------------------
// resolveClickUrl — URL resolution from SENT event link_map (DATA-08, DATA-09)
// ---------------------------------------------------------------------------

const FALLBACK = 'https://thirdwavebbq.com.au';

describe('resolveClickUrl', () => {
  const linkHash = 'abc123hash';

  describe('Test 1: resolves URL from SENT event link_map when messageId and linkHash match', () => {
    it('returns the URL stored in link_map for the matching linkHash', () => {
      const sentMetadata = { link_map: { [linkHash]: 'https://example.com/page' } };
      expect(resolveClickUrl(sentMetadata, linkHash)).toBe('https://example.com/page');
    });
  });

  describe('Test 2: preserves URLs with UTM parameters', () => {
    it('returns URL with UTM params unchanged', () => {
      const url = 'https://example.com/promo?utm_source=email&utm_medium=campaign&utm_campaign=launch';
      const sentMetadata = { link_map: { [linkHash]: url } };
      expect(resolveClickUrl(sentMetadata, linkHash)).toBe(url);
    });

    it('preserves multiple query parameters including UTM', () => {
      const url = 'https://shop.example.com/product?id=42&ref=email&utm_source=twmail&utm_medium=newsletter';
      const sentMetadata = { link_map: { [linkHash]: url } };
      expect(resolveClickUrl(sentMetadata, linkHash)).toBe(url);
    });
  });

  describe('Test 3: preserves URLs with encoded query strings', () => {
    it('returns URL with percent-encoded spaces unchanged (%20)', () => {
      const url = 'https://example.com/search?q=hello%20world';
      const sentMetadata = { link_map: { [linkHash]: url } };
      expect(resolveClickUrl(sentMetadata, linkHash)).toBe(url);
    });

    it('returns URL with %3D (=) and %26 (&) encoded characters unchanged', () => {
      const url = 'https://example.com/redirect?data=key%3Dvalue%26other%3Dthing';
      const sentMetadata = { link_map: { [linkHash]: url } };
      expect(resolveClickUrl(sentMetadata, linkHash)).toBe(url);
    });

    it('does not double-encode an already percent-encoded URL', () => {
      const url = 'https://example.com/path?param=hello%20world%26more';
      const sentMetadata = { link_map: { [linkHash]: url } };
      const result = resolveClickUrl(sentMetadata, linkHash);
      // Must not contain %2520 (double-encoded %25 + 20)
      expect(result).not.toContain('%2520');
      expect(result).toBe(url);
    });
  });

  describe('Test 4: returns fallback when no SENT event found', () => {
    it('returns fallback when sentMetadata is undefined', () => {
      expect(resolveClickUrl(undefined, linkHash)).toBe(FALLBACK);
    });

    it('returns fallback when sentMetadata is null', () => {
      expect(resolveClickUrl(null, linkHash)).toBe(FALLBACK);
    });
  });

  describe('Test 5: returns fallback when linkHash not in link_map', () => {
    it('returns fallback when link_map exists but linkHash is missing', () => {
      const sentMetadata = { link_map: { other_hash: 'https://example.com' } };
      expect(resolveClickUrl(sentMetadata, linkHash)).toBe(FALLBACK);
    });

    it('returns fallback when link_map is empty', () => {
      const sentMetadata = { link_map: {} };
      expect(resolveClickUrl(sentMetadata, linkHash)).toBe(FALLBACK);
    });

    it('returns fallback when metadata has no link_map key', () => {
      const sentMetadata = { other_field: 'value' };
      expect(resolveClickUrl(sentMetadata, linkHash)).toBe(FALLBACK);
    });
  });

  describe('Test 6: blocks non-http/https protocols', () => {
    it('returns fallback for javascript: protocol in link_map', () => {
      const sentMetadata = { link_map: { [linkHash]: 'javascript:alert(1)' } };
      expect(resolveClickUrl(sentMetadata, linkHash)).toBe(FALLBACK);
    });

    it('returns fallback for data: protocol in link_map', () => {
      const sentMetadata = { link_map: { [linkHash]: 'data:text/html,<script>alert(1)</script>' } };
      expect(resolveClickUrl(sentMetadata, linkHash)).toBe(FALLBACK);
    });

    it('returns fallback for malformed URL in link_map', () => {
      const sentMetadata = { link_map: { [linkHash]: 'not-a-valid-url' } };
      expect(resolveClickUrl(sentMetadata, linkHash)).toBe(FALLBACK);
    });
  });
});

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
