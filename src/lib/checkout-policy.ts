import { CHECKOUT_AVAILABLE } from "./checkout-config";

/**
 * Server-side checkout policy.
 *
 * `CHECKOUT_AVAILABLE` is the deliberate master switch. The production-specific
 * guard (D-024) was removed in the reviewed enablement after one staging order
 * was verified end to end, so the switch alone now decides availability in every
 * environment (D-032). Only the server calls this, and the browser never
 * evaluates deployment environment variables.
 */
export function checkoutEnabled(): boolean {
  return CHECKOUT_AVAILABLE;
}
