import { NextResponse } from "next/server";
import { loadShopCatalog, priceForCycle } from "@/lib/catalog";
import { createOrder, updateOrder } from "@/lib/store";
import { isCycle, CYCLE_MONTHS } from "@/lib/pricing";
import { baseUrl, devCheckoutAllowed, stripe } from "@/lib/stripe";
import { provisionOrder } from "@/lib/orders";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let body: { sku?: string; os?: string; cycle?: string; email?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  if (!body || typeof body !== "object" ||
    [body.sku, body.os, body.cycle, body.email].some((v) => v !== undefined && typeof v !== "string")) {
    return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  }
  const sku = body.sku?.trim();
  const os = body.os?.trim();
  const cycle = body.cycle?.trim() ?? "MONTHLY";
  const email = body.email?.trim() || null;

  if (!sku || !os) {
    return NextResponse.json({ error: "sku_and_os_required" }, { status: 400 });
  }
  if (!isCycle(cycle)) {
    return NextResponse.json({ error: "unknown_cycle" }, { status: 400 });
  }

  let shop;
  try {
    shop = await loadShopCatalog();
  } catch (error) {
    return NextResponse.json(
      { error: "catalog_unavailable", message: error instanceof Error ? error.message : "Unknown" },
      { status: 502 },
    );
  }

  const plan = shop.plans.find((entry) => entry.sku === sku);
  if (!plan) {
    return NextResponse.json({ error: "unknown_plan" }, { status: 400 });
  }

  const osTemplate = shop.catalog.os.find((entry) => entry.slug === os);
  if (!osTemplate) {
    return NextResponse.json({ error: "unknown_os" }, { status: 400 });
  }

  if (!plan.retail[cycle]) {
    return NextResponse.json({ error: "cycle_not_offered" }, { status: 400 });
  }

  const amount = priceForCycle(plan, cycle);
  const order = await createOrder({ planSku: plan.sku, os, cycle, amountCents: amount, email });

  const origin = baseUrl(request.url);
  const successUrl = `${origin}/order/${order.token}`;

  const client = stripe();
  if (client) {
    try {
      const session = await client.checkout.sessions.create({
        mode: "payment",
        customer_email: email ?? undefined,
        success_url: successUrl,
        cancel_url: `${origin}/?cancelled=1`,
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: "usd",
              unit_amount: amount,
              product_data: {
                name: `${plan.name} — ${plan.region} ${plan.tier}`,
                description: `${plan.cpuCores} vCPU, ${Math.round(plan.ramMb / 1024)} GB RAM, ${plan.diskGb} GB NVMe, ${osTemplate.name}, ${cycle} (${CYCLE_MONTHS[cycle]} month${CYCLE_MONTHS[cycle] > 1 ? "s" : ""})`,
              },
            },
          },
        ],
        metadata: { orderId: String(order.id), token: order.token },
      });

      await updateOrder(order.id, { stripe_session: session.id });

      return NextResponse.json({ url: session.url, token: order.token });
    } catch (error) {
      await updateOrder(order.id, { status: "FAILED", error: "Checkout session creation failed" });
      return NextResponse.json(
        { error: "stripe_error", message: error instanceof Error ? error.message : "Unknown" },
        { status: 502 },
      );
    }
  }

  if (!devCheckoutAllowed()) {
    return NextResponse.json(
      { error: "payments_not_configured", message: "Set STRIPE_SECRET_KEY to accept payments." },
      { status: 503 },
    );
  }

  await updateOrder(order.id, { status: "PAID" });
  await provisionOrder({ ...order, status: "PAID" });

  return NextResponse.json({ url: `/order/${order.token}`, token: order.token, dev: true });
}
