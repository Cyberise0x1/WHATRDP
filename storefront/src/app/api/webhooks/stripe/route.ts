import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { stripe } from "@/lib/stripe";
import { orderRepository } from "@/lib/store";
import { acceptCheckoutPayment } from "@/lib/payments";
import { provisionOrder } from "@/lib/orders";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const client = stripe();
  const secret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  if (!client || !secret) return NextResponse.json({ error: "stripe_not_configured" }, { status: 503 });
  const signature = request.headers.get("stripe-signature");
  if (!signature) return NextResponse.json({ error: "missing_signature" }, { status: 400 });
  const raw = await request.text();
  let event: Stripe.Event;
  try {
    event = await client.webhooks.constructEventAsync(raw, signature, secret);
  } catch {
    return NextResponse.json({ error: "invalid_signature" }, { status: 400 });
  }

  if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") {
    const notification = event.data.object as Stripe.Checkout.Session;
    try {
      // Signed notification is a trigger, not sufficient proof of a matching payment.
      const session = await client.checkout.sessions.retrieve(notification.id);
      const accepted = await acceptCheckoutPayment(await orderRepository(), session);
      if (accepted.kind === "mismatch") return NextResponse.json({ error: "payment_mismatch" }, { status: 409 });
      if (accepted.kind === "unknown") return NextResponse.json({ error: "order_not_linked" }, { status: 409 });
      if (accepted.kind === "paid") await provisionOrder(accepted.order);
    } catch {
      return NextResponse.json({ error: "payment_processing_unavailable" }, { status: 503 });
    }
  }
  return NextResponse.json({ received: true });
}
