import { NextResponse } from "next/server";
import { verifyWebhook } from "@/lib/signature";
import { getOrderByServiceId, updateOrder } from "@/lib/store";
import { syncOrder } from "@/lib/orders";
import { raiseAlert } from "@/lib/alerts";
import { classifySupplierEvent } from "@/lib/supplier-events";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface WebhookPayload {
  event?: string;
  createdAt?: string;
  data?: { serviceId?: string; ip?: string; expiresAt?: string; cycle?: string };
}

export async function POST(request: Request) {
  const secret = process.env.RDPM_WEBHOOK_SECRET?.trim();
  if (!secret) {
    raiseAlert({
      code: "webhook_secret_missing",
      severity: "critical",
      message: "RDPM_WEBHOOK_SECRET is not configured",
      context: { provider: "rdpmonster" },
    });
    return NextResponse.json({ error: "webhook_secret_not_configured" }, { status: 503 });
  }

  const raw = await request.text();
  if (!verifyWebhook(raw, request.headers, secret)) {
    return NextResponse.json({ error: "invalid_signature" }, { status: 401 });
  }

  let payload: WebhookPayload;
  try {
    payload = JSON.parse(raw) as WebhookPayload;
  } catch {
    raiseAlert({
      code: "webhook_invalid_payload",
      severity: "warning",
      message: "A verified supplier webhook body was not valid JSON",
      context: { provider: "rdpmonster" },
    });
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const kind = classifySupplierEvent(payload.event);

  // Billing events do not map to one of our order rows. Invoices are expected;
  // a failed payment needs a human.
  if (kind === "invoice") {
    return NextResponse.json({ received: true, ignored: payload.event });
  }
  if (kind === "payment_failed") {
    raiseAlert({
      code: "supplier_payment_failed",
      severity: "critical",
      message: "The supplier reported a failed payment",
      context: { provider: "rdpmonster", type: payload.event },
    });
    return NextResponse.json({ received: true });
  }
  if (kind === "unknown") {
    return NextResponse.json({ received: true, ignored: payload.event ?? "unknown event" });
  }

  const serviceId = payload.data?.serviceId;
  if (!serviceId) {
    return NextResponse.json({ received: true, ignored: "no serviceId" });
  }

  try {
    const order = await getOrderByServiceId(serviceId);
    if (!order) {
      // A provider event that matches no order usually means an order was
      // deleted or labels drifted; it needs a human, not another retry.
      raiseAlert({
        code: "supplier_webhook_unmatched",
        severity: "warning",
        message: "A verified supplier webhook referenced an unknown service",
        context: { provider: "rdpmonster", type: payload.event },
      });
      return NextResponse.json({ received: true, ignored: "unknown service" });
    }

    if (kind === "sync") {
      // Provider data is authoritative; do not trust event-supplied status or IP.
      await syncOrder(order, true);
    } else {
      await updateOrder(order.id, { error: "Service is expiring soon" });
    }
  } catch {
    raiseAlert({
      code: "supplier_webhook_failed",
      severity: "critical",
      message: "A verified supplier webhook could not be processed",
      context: { provider: "rdpmonster", type: payload.event },
    });
    return NextResponse.json({ error: "webhook_failed" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
