import crypto from "node:crypto";

/** WooCommerce signs webhook bodies: base64(HMAC-SHA256(body, secret)). */
export function verifyWooWebhook(body: string, signature: string | null, secret: string): boolean {
  if (!signature || !secret) return false;
  const expected = crypto.createHmac("sha256", secret).update(body, "utf8").digest();
  const given = Buffer.from(signature, "base64");
  return given.length === expected.length && crypto.timingSafeEqual(given, expected);
}
