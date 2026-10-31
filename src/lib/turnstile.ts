const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export interface TurnstileResult {
  success: boolean;
  codes: string[];
}

/**
 * Server-side Turnstile validation. Checkout only calls this when
 * `TURNSTILE_SECRET_KEY` is configured; the client sends the widget token.
 */
export async function verifyTurnstile(
  token: string | null | undefined,
  remoteIp: string | null,
  secret = process.env.TURNSTILE_SECRET_KEY,
  endpoint = process.env.TURNSTILE_BASE_URL ?? VERIFY_URL,
): Promise<TurnstileResult> {
  if (!secret) return { success: false, codes: ["missing-secret"] };
  if (!token) return { success: false, codes: ["missing-token"] };

  const body = new URLSearchParams({ secret, response: token });
  if (remoteIp) body.set("remoteip", remoteIp);

  try {
    const response = await fetch(endpoint, { method: "POST", body, cache: "no-store" });
    if (!response.ok) return { success: false, codes: ["verify-http-error"] };
    const payload = (await response.json()) as {
      success?: boolean;
      "error-codes"?: string[];
    };
    return { success: Boolean(payload.success), codes: payload["error-codes"] ?? [] };
  } catch {
    return { success: false, codes: ["verify-error"] };
  }
}
