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
  if (
    !payment.paid ||
    payment.orderId !== order.id ||
    payment.orderToken !== order.token ||
    payment.amount !== order.amount_cents ||
    payment.currency !== order.currency
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
