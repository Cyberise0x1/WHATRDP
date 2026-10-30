// Zeno Bank (crypto) adapter. Hosted checkout + Svix-signed webhooks.
// Contract: https://docs.zenobank.io/api-reference/checkouts/create-a-new-checkout
// and https://docs.zenobank.io/api-reference/webhooks

export type ZenoCurrency = "USD" | "NGN";

export interface ZenoCheckoutRequest {
  orderId: string;
  /** Decimal string, e.g. "15.99". Never send a float. */
  priceAmount: string;
  priceCurrency: ZenoCurrency;
  successRedirectUrl?: string;
}

export interface ZenoCheckout {
  id: string;
  orderId: string;
  priceCurrency: string;
  priceAmount: string;
  status: string;
  expiresAt: string;
  checkoutUrl: string;
  createdAt: string;
  successRedirectUrl: string | null;
}

export interface ZenoEvent {
  type: "checkout.completed" | "checkout.expired" | "checkout.partially_paid" | string;
  data: {
    id: string;
    orderId: string;
    priceCurrency: string;
    priceAmount: string;
    paidAmount: string;
    status: string;
    expiresAt: string;
    checkoutUrl: string;
    createdAt: string;
    successRedirectUrl: string | null;
  };
}

function baseUrl(): string {
  const raw = process.env.ZENO_BASE_URL?.trim() || "https://api.zenobank.io";
  return raw.replace(/\/+$/, "");
}

function apiKey(): string {
  const key = process.env.ZENO_API_KEY?.trim();
  if (!key) throw new Error("ZENO_API_KEY is not configured");
  return key;
}

export async function createCheckout(input: ZenoCheckoutRequest): Promise<ZenoCheckout> {
  const response = await fetch(`${baseUrl()}/api/v1/checkouts`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-API-Key": apiKey() },
    body: JSON.stringify(input),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) {
    throw new Error(`Zeno checkout failed with status ${response.status}`);
  }
  return (await response.json()) as ZenoCheckout;
}

/** Convert a decimal string ("15.99") to minor units (1599). */
export function toMinorUnits(value: string): number {
  if (!/^\d+(\.\d{1,2})?$/.test(value)) throw new Error("Invalid decimal amount");
  const [whole, fraction = ""] = value.split(".");
  return Number(whole) * 100 + Number((fraction + "00").slice(0, 2));
}

function decodeBase64(value: string): Uint8Array<ArrayBuffer> {
  const padded = value + "=".repeat((4 - (value.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function constantTimeEqual(a: string, b: string): boolean {
  const left = new TextEncoder().encode(a);
  const right = new TextEncoder().encode(b);
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left[index] ^ right[index];
  }
  return difference === 0;
}

/**
 * Svix/Standard Webhooks verification, implemented with WebCrypto (D-010).
 * Signed content is `${svix-id}.${svix-timestamp}.${rawBody}`; the key is the
 * base64-decoded `whsec_…` secret. Rejects timestamps older than 300 s.
 */
export async function verifyZenoWebhook(
  rawBody: string,
  headers: Headers,
  secret: string,
): Promise<boolean> {
  const id = headers.get("svix-id") ?? "";
  const timestamp = headers.get("svix-timestamp") ?? "";
  const signatureHeader = headers.get("svix-signature") ?? "";
  if (!id || !timestamp || !signatureHeader || !secret) return false;

  const skew = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (!Number.isFinite(skew) || skew > 300) return false;

  const rawSecret = secret.startsWith("whsec_") ? secret.slice("whsec_".length) : secret;
  const key = await crypto.subtle.importKey(
    "raw",
    decodeBase64(rawSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const digest = new Uint8Array(
    await crypto.subtle.sign(
      "HMAC",
      key,
      new TextEncoder().encode(`${id}.${timestamp}.${rawBody}`),
    ),
  );
  const expected = btoa(String.fromCharCode(...digest));

  // The header may carry several space-separated signatures: "v1,<sig> v1,<sig>".
  return signatureHeader.split(" ").some((entry) => {
    const [version, provided] = entry.split(",");
    return version === "v1" && Boolean(provided) && constantTimeEqual(provided, expected);
  });
}
