/**
 * Email output guards for validating compiled HTML before sending.
 *
 * OPS-04: Detect uncompiled MJML source — defensive guard in bulk-send worker.
 * OPS-05: Reject relative URLs — all src/href values must be absolute in email HTML.
 */

/**
 * Asserts that all src and href attributes in the HTML are absolute URLs.
 * Relative URLs break in email clients because there is no base URL context.
 *
 * Allowed schemes: https://, http://, mailto:, tel:, cid:, # (fragment), and empty string.
 *
 * @throws Error with OPS-05 code if relative URLs are found, including up to 3 examples.
 */
export function assertAbsoluteUrls(html: string, campaignId: number): void {
  const pattern = /(?:src|href)="(?!https?:|mailto:|tel:|cid:|#|$)([^"]{1,200})"/gi;
  const matches: string[] = [];
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(html)) !== null && matches.length < 3) {
    matches.push(match[1]!);
  }

  if (matches.length > 0) {
    const samples = matches.join(', ');
    throw new Error(`OPS-05: Campaign ${campaignId} contains relative URLs in email HTML: ${samples}`);
  }
}

/**
 * Returns true if the given string is uncompiled MJML source code.
 * MJML source starts with `<mjml>` or `<mjml ` (case-sensitive per MJML spec).
 * Used as a defensive guard to reject content that was never compiled.
 */
export function isMjmlSource(html: string): boolean {
  const trimmed = html.trimStart();
  return trimmed.startsWith('<mjml>') || trimmed.startsWith('<mjml ');
}
