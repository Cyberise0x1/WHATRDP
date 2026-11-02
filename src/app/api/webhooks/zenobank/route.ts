import { NextResponse } from "next/server";
import { verifyZenoWebhook, toMinorUnits, type ZenoEvent } from "@/lib/zenobank";
import { acceptVerifiedPayment } from "@/lib/payments";
import { orderRepository } from "@/lib/store";
import { startProvisionWorkflow } from "@/lib/workflow-dispatch";
import { raiseAlert } from "@/lib/alerts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Zeno Bank webhook (Svix-signed, at-least-once). Signature is checked on the
// raw body before parsing. Settlement is idempotent via claimPayment, and
// duplicate deliveries are acknowledged from webhook_events.
export async function POST(request: Request) {
  const secret = process.env.ZENO_WEBHOOK_SECRET?.trim();
  if (!secret) {
    raiseAlert({
      code: "webhook_secret_missing",
      severity: "critical",
      message: "ZENO_WEBHOOK_SECRET is not configured",
      context: { provider: "zeno" },
    });
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
    raiseAlert({
      code: "webhook_invalid_payload",
      severity: "warning",
      message: "A verified Zeno webhook body was not valid JSON",
      context: { provider: "zeno" },
    });
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const data = event.data;
  const svixId = request.headers.get("svix-id") ?? "";
  if (!data?.id) {
    raiseAlert({
      code: "webhook_invalid_payload",
      severity: "warning",
      message: "A verified Zeno webhook did not identify a checkout",
      context: { provider: "zeno", type: event.type },
    });
    return NextResponse.json({ received: true, ignored: "no checkout id" });
  }

  try {
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
      raiseAlert({
        code: "webhook_invalid_amount",
        severity: "warning",
        message: "A verified Zeno payment carried an invalid amount",
        context: { provider: "zeno" },
      });
      return NextResponse.json({ error: "invalid_amount" }, { status: 400 });
    }

    const order = await store.byPaymentReference(data.id);
    if (!order) {
      // Money moved and we cannot attach it to an order: the highest-signal
      // webhook failure there is.
      raiseAlert({
        code: "payment_unmatched",
        severity: "critical",
        message: "A verified payment did not match any order",
        context: {
          checkoutId: data.id,
          amountMinor: amount,
          currency: data.priceCurrency,
        },
      });
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

    if (result.kind === "mismatch") {
      raiseAlert({
        code: "payment_mismatch",
        severity: "critical",
        message: "A verified payment did not match its order's amount or currency",
        context: {
          orderId: order.id,
          chargedMinor: amount,
          chargedCurrency: data.priceCurrency,
          expectedMinor: order.charge_amount_minor ?? order.amount_cents,
          expectedCurrency: order.charge_currency ?? order.currency,
        },
      });
    }

    // Dispatch after settlement when the environment's provisioning switch is on.
    // A dispatch failure must not undo the recorded payment; the order stays PAID
    // for reconciliation.
    if (result.kind === "paid") {
      try {
        await startProvisionWorkflow(result.order.id);
      } catch {
        // The payment is durable; reconciliation will retry dispatch.
      }
    }

    await store.recordWebhookEvent(svixId, event.type);
    return NextResponse.json({ received: true, result: result.kind });
  } catch {
    raiseAlert({
      code: "zeno_webhook_failed",
      severity: "critical",
      message: "A verified Zeno webhook could not be processed",
      context: { provider: "zeno", type: event.type },
    });
    return NextResponse.json({ error: "webhook_failed" }, { status: 500 });
  }
}
