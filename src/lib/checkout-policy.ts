import { CHECKOUT_AVAILABLE } from "./checkout-config";

/**
 * Server-side checkout policy.
 *
 * `CHECKOUT_AVAILABLE` is the deliberate master switch. Production additionally
 * stays closed until fulfilment can be enabled and verified end to end (D-018,
 * D-024): funding the supplier balance must not silently open real payments while
 * provisioning is disabled. Only the server calls this, so the browser never
 * evaluates deployment environment variables.
 */
export function checkoutEnabled(target = process.env.DEPLOYMENT_TARGET): boolean {
  if (!CHECKOUT_AVAILABLE) return false;
  return target !== "cloudflare-production";
}
