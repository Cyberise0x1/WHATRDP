import { loadShopCatalog, priceForCycle } from "./catalog";
import { isCycle, type Cycle } from "./pricing";
import { createOrder, updateOrder } from "./store";
import { createCheckout } from "./zenobank";

export type CheckoutCurrency = "USD";

export interface CheckoutInput {
  sku: string;
  os: string;
  cycle: Cycle;
  email: string | null;
  currency: CheckoutCurrency;
}

export interface CheckoutResult {
  token: string;
  checkoutUrl: string;
}

export class CheckoutError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
  ) {
    super(message);
    this.name = "CheckoutError";
  }
}

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** Validate the request body before catalogue access, persistence or any gateway call. */
export function parseCheckoutInput(payload: unknown): CheckoutInput {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new CheckoutError("A JSON object is required", 400, "invalid_request");
  }
  const record = payload as Record<string, unknown>;

  const sku = typeof record.sku === "string" ? record.sku.trim() : "";
  if (!sku) throw new CheckoutError("Choose a plan", 400, "invalid_sku");

  const os = typeof record.os === "string" ? record.os.trim() : "";
  if (!os) throw new CheckoutError("Choose an operating system", 400, "invalid_os");

  const cycle = typeof record.cycle === "string" ? record.cycle : "";
  if (!isCycle(cycle)) {
    throw new CheckoutError("Choose a supported billing term", 400, "invalid_cycle");
  }

  // Checkout is USD-only. Anything else is refused rather than charged at an
  // invented rate.
  if (record.currency !== undefined && record.currency !== "USD") {
    throw new CheckoutError("Only USD checkout is enabled", 400, "currency_not_supported");
  }

  let email: string | null = null;
  if (record.email !== undefined && record.email !== null) {
    if (typeof record.email !== "string") {
      throw new CheckoutError("Provide a valid email address", 400, "invalid_email");
    }
    const candidate = record.email.trim().toLowerCase();
    if (candidate.length > 254 || !EMAIL.test(candidate)) {
      throw new CheckoutError("Provide a valid email address", 400, "invalid_email");
    }
    email = candidate;
  }

  return { sku, os, cycle, email, currency: "USD" };
}

/** Zeno expects a decimal string; never send a float. */
export function formatAmount(cents: number): string {
  if (!Number.isInteger(cents) || cents <= 0) {
    throw new CheckoutError("Invalid order amount", 500, "invalid_amount");
  }
  return (cents / 100).toFixed(2);
}

/**
 * Create the order, then the hosted checkout.
 *
 * The order row is written first so provisioning intent exists before any
 * billable supplier request. A failed gateway call leaves the row without a
 * payment reference, so nothing can settle or provision it.
 */
export async function createOrderCheckout(
  payload: unknown,
  options: { origin?: string } = {},
): Promise<CheckoutResult> {
  const input = parseCheckoutInput(payload);

  let shop;
  try {
    shop = await loadShopCatalog();
  } catch {
    throw new CheckoutError("The catalogue is unavailable", 502, "catalog_unavailable");
  }

  const plan = shop.plans.find((candidate) => candidate.sku === input.sku);
  if (!plan) throw new CheckoutError("Unknown plan", 404, "unknown_plan");
  if (!shop.catalog.os.some((template) => template.slug === input.os)) {
    throw new CheckoutError("Unsupported operating system", 400, "unknown_os");
  }

  const amountCents = priceForCycle(plan, input.cycle);

  const order = await createOrder({
    planSku: plan.sku,
    os: input.os,
    cycle: input.cycle,
    amountCents,
    email: input.email,
    chargeCurrency: "USD",
    chargeAmountMinor: amountCents,
  });

  const origin = options.origin?.replace(/\/+$/, "") ?? "";
  let checkout;
  try {
    checkout = await createCheckout({
      orderId: String(order.id),
      priceAmount: formatAmount(amountCents),
      priceCurrency: "USD",
      successRedirectUrl: origin ? `${origin}/order/${order.token}` : undefined,
    });
  } catch {
    await updateOrder(order.id, {
      error: "Checkout could not be started. No payment was taken; try again.",
    });
    throw new CheckoutError("The payment gateway is unavailable", 502, "gateway_unavailable");
  }

  await updateOrder(order.id, { payment_reference: checkout.id });
  return { token: order.token, checkoutUrl: checkout.checkoutUrl };
}
