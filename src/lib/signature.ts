import { createHmac, timingSafeEqual } from "node:crypto";

function matches(expected: string, provided: string): boolean {
  const a = Buffer.from(expected);
  const b = Buffer.from(provided);
  return a.length === b.length && timingSafeEqual(a, b);
}

function sign(secret: string | Buffer, timestamp: string, rawBody: string): string {
  return createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex");
}

/**
 * Provider webhook signature: `X-RDPM-Signature: v1=<hex>` over
 * `timestamp + "." + rawBody`, HMAC-SHA256.
 *
 * The provider's newer webhook API shows the secret as `whsec_…`. If it signs
 * with the decoded key rather than the display string, accept both so a secret
 * format change cannot silently reject every delivery. A bare hex signature is
 * also accepted; all candidates are HMACs of the same body and secret.
 */
export function verifyWebhook(rawBody: string, headers: Headers, secret: string): boolean {
  const timestamp = headers.get("x-rdpm-timestamp") ?? "";
  const signature = headers.get("x-rdpm-signature") ?? "";

  if (!timestamp || !signature || !secret) return false;

  const skew = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (!Number.isFinite(skew) || skew > 300) return false;

  const candidates = new Set<string>();
  const rawHex = sign(secret, timestamp, rawBody);
  candidates.add(`v1=${rawHex}`);
  candidates.add(rawHex);

  if (secret.startsWith("whsec_")) {
    const decoded = Buffer.from(secret.slice("whsec_".length), "base64");
    if (decoded.length) {
      const decodedHex = sign(decoded, timestamp, rawBody);
      candidates.add(`v1=${decodedHex}`);
      candidates.add(decodedHex);
    }
  }

  return [...candidates].some((expected) => matches(expected, signature));
}
