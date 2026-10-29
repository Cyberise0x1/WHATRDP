import { NextResponse } from "next/server";
import { verifyWebhook } from "@/lib/signature";
import { getOrderByServiceId, updateOrder } from "@/lib/store";
import { syncOrder } from "@/lib/orders";

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
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const serviceId = payload.data?.serviceId;
  if (!serviceId) {
    return NextResponse.json({ received: true, ignored: "no serviceId" });
  }

  const order = await getOrderByServiceId(serviceId);
  if (!order) {
    return NextResponse.json({ received: true, ignored: "unknown service" });
  }

  switch (payload.event) {
    case "server.created":
    case "server.delivered":
    case "server.renewed":
    case "server.suspended":
    case "server.deleted":
      // Provider data is authoritative; do not trust event-supplied status or IP.
      await syncOrder(order, true);
      break;
    case "service.expiring":
      await updateOrder(order.id, { error: "Service is expiring soon" });
      break;
    default:
      break;
  }

  return NextResponse.json({ received: true });
}
