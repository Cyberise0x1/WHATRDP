import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { stripe } from "@/lib/stripe";
import { getOrderByStripeSession, getOrderById, updateOrder } from "@/lib/store";
import { provisionOrder } from "@/lib/orders";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const client = stripe();
  const secret = process.env.STRIPE_WEBHOOK_SECRET?.trim();

  if (!client || !secret) {
    return NextResponse.json({ error: "stripe_not_configured" }, { status: 503 });
  }

  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "missing_signature" }, { status: 400 });
  }

  const raw = await request.text();

  let event: Stripe.Event;
  try {
    event = await client.webhooks.constructEventAsync(raw, signature, secret);
  } catch (error) {
    return NextResponse.json(
      { error: "invalid_signature", message: error instanceof Error ? error.message : "Unknown" },
      { status: 400 },
    );
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const orderId = Number(session.metadata?.orderId ?? 0);
    const order = resolveOrder(orderId, session.id);

    if (order && order.status === "PENDING_PAYMENT") {
      const paid = updateOrder(order.id, { status: "PAID", error: null });
      await provisionOrder(paid);
    }
  }

  return NextResponse.json({ received: true });
}

function resolveOrder(orderId: number, sessionId: string) {
  const byId = orderId > 0 ? getOrderById(orderId) : null;
  return byId ?? getOrderByStripeSession(sessionId);
}
