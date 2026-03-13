import { createHmac, timingSafeEqual } from 'crypto';

/**
 * Verify an HMAC-SHA256 webhook signature using constant-time comparison (OPS-06).
 *
 * Prevents timing-oracle attacks by using crypto.timingSafeEqual instead of
 * string equality. Returns false on length mismatch rather than throwing.
 *
 * @param secret - Webhook shared secret
 * @param body - Raw request body string that was signed
 * @param receivedSignature - Signature from the request header (e.g. "sha256=<hex>")
 * @returns true if the signature matches, false otherwise
 */
export function verifyHmacSignature(secret: string, body: string, receivedSignature: string): boolean {
  const expectedHex = createHmac('sha256', secret).update(body).digest('hex');
  const expected = `sha256=${expectedHex}`;

  const expectedBuf = Buffer.from(expected, 'utf-8');
  const receivedBuf = Buffer.from(receivedSignature, 'utf-8');

  // Length mismatch would cause timingSafeEqual to throw — return false instead
  if (expectedBuf.length !== receivedBuf.length) {
    return false;
  }

  return timingSafeEqual(expectedBuf, receivedBuf);
}
