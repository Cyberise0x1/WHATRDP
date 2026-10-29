import type { OrderRepository } from "./storage/repository";

export interface CheckoutPayment {
  id: string;
  status: string | null;
  payment_status: string;
  amount_total: number | null;
  currency: string | null;
  metadata: Record<string, string> | null;
}

// The caller must first verify the webhook signature and retrieve this session from Stripe.
export async function acceptCheckoutPayment(store: OrderRepository, session: CheckoutPayment) {
  const order = await store.bySession(session.id);
  if (!order) return { kind: "unknown" as const };
  if (
    session.status !== "complete" || session.payment_status !== "paid" ||
    session.currency?.toLowerCase() !== "usd" || session.amount_total !== order.amount_cents ||
    session.metadata?.orderId !== String(order.id) || session.metadata?.token !== order.token
  ) return { kind: "mismatch" as const };
  const claimed = await store.claimPayment(order.id, session.id, session.amount_total);
  return claimed ? { kind: "paid" as const, order: claimed } : { kind: "duplicate" as const };
}
