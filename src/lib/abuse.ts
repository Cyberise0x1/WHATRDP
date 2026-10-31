export interface RateLimiterBinding {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

/**
 * Best-effort client identity for the checkout limiter. Cloudflare sets
 * `cf-connecting-ip`; `x-forwarded-for` is a fallback for local/preview use.
 */
export function clientKey(request: Request): string {
  const forwarded =
    request.headers.get("cf-connecting-ip") ?? request.headers.get("x-forwarded-for");
  const first = forwarded?.split(",")[0]?.trim();
  return first || "unknown";
}

/**
 * Returns true when the request may proceed.
 *
 * Fail-open: an absent binding (Node dev) or a limiter error must not take the
 * shop down. The binding is configured per environment, so the protection is
 * active exactly where it is deployed.
 */
export async function allowCheckout(
  request: Request,
  limiter?: RateLimiterBinding,
): Promise<boolean> {
  if (!limiter) return true;
  try {
    return (await limiter.limit({ key: clientKey(request) })).success;
  } catch {
    return true;
  }
}
