import { createHash } from 'crypto';

const BASE_URL = process.env['BASE_URL'] ?? 'https://mail.thirdwavebbq.com.au';

// Inject open tracking pixel before </body>
export function injectTrackingPixel(html: string, messageId: string): string {
  const pixel = `<img src="${BASE_URL}/t/o/${messageId}.png" width="1" height="1" alt="" style="display:none;" />`;

  if (html.includes('</body>')) {
    return html.replace('</body>', `${pixel}</body>`);
  }
  // If no </body>, append at end
  return html + pixel;
}

// Rewrite all links for click tracking
// Replaces href="https://..." with href="BASE_URL/t/c/{messageId}/{linkHash}"
export function rewriteLinks(html: string, messageId: string): string {
  // Match href="..." in anchor tags, skip mailto: and tel: and tracking URLs
  return html.replace(
    /href="(https?:\/\/[^"]+)"/gi,
    (_match, url: string) => {
      // Don't rewrite our own tracking URLs
      if (url.startsWith(`${BASE_URL}/t/`)) {
        return _match;
      }
      // Don't rewrite unsubscribe URLs (already tracked)
      if (url.includes('/t/u/') || url.includes('/t/preferences/')) {
        return _match;
      }
      const linkHash = hashUrl(url);
      return `href="${BASE_URL}/t/c/${messageId}/${linkHash}"`;
    },
  );
}

// Generate a short hash for a URL
function hashUrl(url: string): string {
  return createHash('sha256').update(url).digest('hex').substring(0, 12);
}

// Add email headers for unsubscribe compliance (RFC 8058)
export function getUnsubscribeHeaders(messageId: string): Record<string, string> {
  const unsubUrl = `${BASE_URL}/t/u/${messageId}`;
  return {
    'List-Unsubscribe': `<${unsubUrl}>`,
    'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
  };
}
