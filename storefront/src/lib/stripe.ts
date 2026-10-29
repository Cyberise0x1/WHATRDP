import Stripe from "stripe";

let client: Stripe | null = null;

export function stripe(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  if (!key) return null;
  client ??= new Stripe(key, { httpClient: Stripe.createFetchHttpClient() });
  return client;
}

export function devCheckoutAllowed(): boolean {
  return process.env.NODE_ENV !== "production" &&
    !process.env.DEPLOYMENT_TARGET?.startsWith("cloudflare") &&
    process.env.ALLOW_DEV_CHECKOUT === "true" && !process.env.STRIPE_SECRET_KEY;
}

export function baseUrl(requestUrl?: string): string {
  const configured = process.env.PUBLIC_BASE_URL?.trim();
  if (configured) return configured.replace(/\/$/, "");
  if (requestUrl) {
    const url = new URL(requestUrl);
    return `${url.protocol}//${url.host}`;
  }
  return "http://localhost:3000";
}
