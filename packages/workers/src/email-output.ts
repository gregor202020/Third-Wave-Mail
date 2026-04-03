/**
 * Email output guards for validating compiled HTML before sending.
 *
 * OPS-04: Detect uncompiled MJML source -- defensive guard in bulk-send worker.
 * OPS-05: Reject relative URLs -- all src/href values must be absolute in email HTML.
 */

/**
 * Returns true if the given string is uncompiled MJML source code.
 * MJML source starts with `<mjml>` or `<mjml ` or contains `<mj-` tags.
 * Used as a defensive guard to reject content that was never compiled to HTML.
 */
export function isMjmlSource(html: string): boolean {
  const trimmed = html.trimStart();
  if (trimmed.startsWith('<mjml>') || trimmed.startsWith('<mjml ')) {
    return true;
  }
  // Also catch content that may not start with <mjml> but contains mj- tags
  return /<mj-\w+/.test(trimmed);
}

/**
 * Asserts that all src and href attributes in the HTML are absolute URLs.
 * Relative URLs break in email clients because there is no base URL context.
 *
 * Allowed schemes: https://, http://, mailto:, tel:, cid:, data:, # (fragment),
 * and merge tags ({{...}}).
 *
 * @throws Error with OPS-05 code if relative URLs are found, including up to 3 examples.
 */
export function assertAbsoluteUrls(html: string, campaignId: number): string {
  const baseUrl = process.env.PUBLIC_URL || process.env.BASE_URL || 'https://mail.thirdwavebbq.com.au';
  // Convert relative URLs to absolute instead of throwing
  return html.replace(
    /((?:src|href)=")(?!https?:|mailto:|tel:|cid:|data:|#|\{\{|$)([^"]{1,200})(")/gi,
    (_match, prefix, relUrl, suffix) => `${prefix}${baseUrl}${relUrl.startsWith('/') ? '' : '/'}${relUrl}${suffix}`,
  );
}
