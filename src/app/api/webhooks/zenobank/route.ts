import { NextResponse } from "next/server";
import { verifyZenoWebhook, toMinorUnits, type ZenoEvent } from "@/lib/zenobank";
import { acceptVerifiedPayment } from "@/lib/payments";
import { orderRepository } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Zeno Bank webhook (Svix-signed, at-least-once). Signature is checked on the
// raw body before parsing. Settlement is idempotent via claimPayment, and
// duplicate deliveries are acknowledged from webhook_events.
export async function POST(request: Request) {
  const secret = process.env.ZENO_WEBHOOK_SECRET?.trim();
  if (!secret) {
    return NextResponse.json({ error: "webhook_secret_not_configured" }, { status: 503 });
  }

  const raw = await request.text();
  if (!(await verifyZenoWebhook(raw, request.headers, secret))) {
    return NextResponse.json({ error: "invalid_signature" }, { status: 401 });
  }

  let event: ZenoEvent;
  try {
    event = JSON.parse(raw) as ZenoEvent;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const data = event.data;
  const svixId = request.headers.get("svix-id") ?? "";
  if (!data?.id) {
    return NextResponse.json({ received: true, ignored: "no checkout id" });
  }

  const store = await orderRepository();
  if (await store.hasWebhookEvent(svixId)) {
    return NextResponse.json({ received: true, duplicate: true });
  }

  // Only a completed checkout settles an order; expiry and partial payment are
  // acknowledged but never provision.
  if (event.type !== "checkout.completed") {
    await store.recordWebhookEvent(svixId, event.type);
    return NextResponse.json({ received: true, ignored: event.type });
  }

  let amount: number;
  try {
    // Validate the CHARGED amount (priceAmount), never paidAmount, which may exceed it.
    amount = toMinorUnits(data.priceAmount);
  } catch {
    return NextResponse.json({ error: "invalid_amount" }, { status: 400 });
  }

  const order = await store.byPaymentReference(data.id);
  if (!order) {
    await store.recordWebhookEvent(svixId, event.type);
    return NextResponse.json({ received: true, ignored: "unknown checkout" });
  }

  const result = await acceptVerifiedPayment(store, {
    reference: data.id,
    orderId: order.id,
    orderToken: order.token,
    amount,
    currency: data.priceCurrency,
    paid: true,
  });
  await store.recordWebhookEvent(svixId, event.type);
  return NextResponse.json({ received: true, result: result.kind });
}
