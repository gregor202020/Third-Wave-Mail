import { describe, it, expect } from 'vitest';
import { assertAbsoluteUrls, isMjmlSource } from '@twmail/workers/email-output';

describe('assertAbsoluteUrls', () => {
  const campaignId = 42;

  describe('passes (no throw)', () => {
    it('allows https src', () => {
      expect(() =>
        assertAbsoluteUrls('<img src="https://example.com/img.png" />', campaignId),
      ).not.toThrow();
    });

    it('allows http src', () => {
      expect(() =>
        assertAbsoluteUrls('<img src="http://example.com/img.png" />', campaignId),
      ).not.toThrow();
    });

    it('allows mailto href', () => {
      expect(() =>
        assertAbsoluteUrls('<a href="mailto:test@test.com">link</a>', campaignId),
      ).not.toThrow();
    });

    it('allows tel href', () => {
      expect(() =>
        assertAbsoluteUrls('<a href="tel:+1234567890">call</a>', campaignId),
      ).not.toThrow();
    });

    it('allows fragment href (#)', () => {
      expect(() =>
        assertAbsoluteUrls('<a href="#">top</a>', campaignId),
      ).not.toThrow();
    });

    it('allows empty href (common in placeholder anchors)', () => {
      expect(() =>
        assertAbsoluteUrls('<a href="">click</a>', campaignId),
      ).not.toThrow();
    });

    it('allows cid src for inline images', () => {
      expect(() =>
        assertAbsoluteUrls('<img src="cid:image001" />', campaignId),
      ).not.toThrow();
    });

    it('passes on empty html', () => {
      expect(() => assertAbsoluteUrls('', campaignId)).not.toThrow();
    });

    it('passes on html with no src or href', () => {
      expect(() =>
        assertAbsoluteUrls('<p>Hello world</p>', campaignId),
      ).not.toThrow();
    });
  });

  describe('throws on relative URLs', () => {
    it('throws on relative src with leading slash', () => {
      expect(() =>
        assertAbsoluteUrls('<img src="/images/logo.png" />', campaignId),
      ).toThrow('OPS-05');
    });

    it('throws on relative href (filename)', () => {
      expect(() =>
        assertAbsoluteUrls('<a href="page.html">link</a>', campaignId),
      ).toThrow('OPS-05');
    });

    it('throws on relative src without leading slash', () => {
      expect(() =>
        assertAbsoluteUrls('<img src="images/logo.png" />', campaignId),
      ).toThrow('OPS-05');
    });

    it('includes campaign ID in error message', () => {
      expect(() =>
        assertAbsoluteUrls('<img src="/bad.png" />', campaignId),
      ).toThrow(`Campaign ${campaignId}`);
    });

    it('includes sample URL in error message', () => {
      expect(() =>
        assertAbsoluteUrls('<img src="/images/logo.png" />', campaignId),
      ).toThrow('/images/logo.png');
    });

    it('includes up to 3 relative URL examples in error message', () => {
      const html =
        '<img src="/a.png" /><img src="/b.png" /><img src="/c.png" /><img src="/d.png" />';
      let errorMessage = '';
      try {
        assertAbsoluteUrls(html, campaignId);
      } catch (err) {
        errorMessage = (err as Error).message;
      }
      // Should contain first 3 but not necessarily 4th
      expect(errorMessage).toContain('/a.png');
      expect(errorMessage).toContain('/b.png');
      expect(errorMessage).toContain('/c.png');
      expect(errorMessage).not.toContain('/d.png');
    });
  });
});

describe('isMjmlSource', () => {
  describe('returns true for MJML source', () => {
    it('detects basic mjml root element', () => {
      expect(isMjmlSource('<mjml><mj-body></mj-body></mjml>')).toBe(true);
    });

    it('detects mjml with leading whitespace', () => {
      expect(isMjmlSource('  <mjml><mj-body></mj-body></mjml>')).toBe(true);
    });

    it('detects mjml with attributes', () => {
      expect(isMjmlSource('<mjml lang="en"><mj-body></mj-body></mjml>')).toBe(true);
    });

    it('detects mjml with leading newline', () => {
      expect(isMjmlSource('\n<mjml>\n<mj-body></mj-body></mjml>')).toBe(true);
    });
  });

  describe('returns false for compiled HTML', () => {
    it('returns false for doctype html', () => {
      expect(isMjmlSource('<!doctype html><html><body>hello</body></html>')).toBe(false);
    });

    it('returns false for html element', () => {
      expect(isMjmlSource('<html><body>hello</body></html>')).toBe(false);
    });

    it('returns false for plain div content', () => {
      expect(isMjmlSource('<div>Hello</div>')).toBe(false);
    });

    it('returns false for empty string', () => {
      expect(isMjmlSource('')).toBe(false);
    });
  });
});
