import { loadShopCatalog, priceForCycle } from "./catalog";
import { isCycle, type Cycle } from "./pricing";
import { createOrder, updateOrder } from "./store";
import { getAccount } from "./rdpmonster";
import { createCheckout } from "./zenobank";
import { verifyTurnstile } from "./turnstile";

export type CheckoutCurrency = "USD";

export interface CheckoutInput {
  sku: string;
  os: string;
  cycle: Cycle;
  email: string | null;
  currency: CheckoutCurrency;
  turnstileToken: string | null;
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

/**
 * Cash buffer kept above the next order's supplier cost. Set
 * SUPPLIER_RESERVE_CENTS to roughly one month of renewals; an invalid value
 * falls back to zero rather than blocking every sale.
 */
export function renewalReserveCents(raw = process.env.SUPPLIER_RESERVE_CENTS): number {
  const parsed = Number(raw ?? "0");
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : 0;
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

  let turnstileToken: string | null = null;
  if (record.turnstileToken !== undefined && record.turnstileToken !== null) {
    if (typeof record.turnstileToken !== "string" || record.turnstileToken.length > 4096) {
      throw new CheckoutError(
        "Complete the human verification challenge",
        400,
        "invalid_turnstile",
      );
    }
    turnstileToken = record.turnstileToken.trim() || null;
  }

  return { sku, os, cycle, email, currency: "USD", turnstileToken };
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
  options: { origin?: string; remoteIp?: string | null } = {},
): Promise<CheckoutResult> {
  const input = parseCheckoutInput(payload);

  // Only enforced when the operator has configured the secret; the widget and
  // the secret must be set together (see docs/DEPLOYMENT.md).
  if (process.env.TURNSTILE_SECRET_KEY) {
    const verification = await verifyTurnstile(input.turnstileToken, options.remoteIp ?? null);
    if (!verification.success) {
      const missing = verification.codes.includes("missing-token");
      throw new CheckoutError(
        missing
          ? "Complete the human verification challenge and try again."
          : "Human verification failed. Try again.",
        403,
        missing ? "turnstile_required" : "turnstile_failed",
      );
    }
  }

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

  const supplierCost = plan.cost[input.cycle];
  if (typeof supplierCost !== "number" || supplierCost <= 0) {
    throw new CheckoutError("Supplier pricing is unavailable", 503, "supplier_cost_unavailable");
  }

  // Fail closed when the live balance cannot be verified: never take money for
  // fulfilment that cannot be funded.
  let account;
  try {
    account = await getAccount();
  } catch {
    throw new CheckoutError(
      "Sales are paused while supplier capacity is verified. No payment was taken.",
      503,
      "supplier_balance_unavailable",
    );
  }

  const requiredCents = supplierCost + renewalReserveCents();
  if (account.balanceCents < requiredCents) {
    // Structured, credential-free alert input: wire this to monitoring (P2-1).
    console.warn("checkout_blocked_supplier_balance", {
      requiredCents,
      availableCents: account.balanceCents,
    });
    throw new CheckoutError(
      "Sales are temporarily paused while supplier capacity is replenished. No payment was taken.",
      503,
      "insufficient_supplier_balance",
    );
  }

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
