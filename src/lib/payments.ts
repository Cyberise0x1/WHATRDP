import type { OrderRepository } from "./storage/repository";

// Internal seam only. A future gateway adapter MUST verify authenticity and
// authoritative settlement before constructing this confirmation. No HTTP
// route currently accepts payments or calls this function.
export interface VerifiedPayment {
  reference: string;
  orderId: number;
  orderToken: string;
  amount: number;
  currency: string;
  paid: boolean;
}

export async function acceptVerifiedPayment(store: OrderRepository, payment: VerifiedPayment) {
  const order = await store.byPaymentReference(payment.reference);
  if (!order) return { kind: "unknown" as const };
  // Validate against what was CHARGED, not the USD cost basis. Legacy orders
  // without the new columns fall back to amount_cents/currency.
  const chargedAmount = order.charge_amount_minor ?? order.amount_cents;
  const chargedCurrency = order.charge_currency ?? order.currency;
  if (
    !payment.paid ||
    payment.orderId !== order.id ||
    payment.orderToken !== order.token ||
    payment.amount !== chargedAmount ||
    payment.currency !== chargedCurrency
  ) {
    return { kind: "mismatch" as const };
  }
  const claimed = await store.claimPayment(
    order.id,
    payment.reference,
    payment.amount,
    payment.currency,
  );
  return claimed ? { kind: "paid" as const, order: claimed } : { kind: "duplicate" as const };
}
