import { createHmac, timingSafeEqual } from "node:crypto";

export function verifyWebhook(rawBody: string, headers: Headers, secret: string): boolean {
  const timestamp = headers.get("x-rdpm-timestamp") ?? "";
  const signature = headers.get("x-rdpm-signature") ?? "";

  if (!timestamp || !signature || !secret) return false;

  const skew = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (!Number.isFinite(skew) || skew > 300) return false;

  const expected =
    "v1=" + createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);

  return a.length === b.length && timingSafeEqual(a, b);
}
