import { NextResponse } from "next/server";
import { CHECKOUT_AVAILABLE, CHECKOUT_UNAVAILABLE_MESSAGE } from "@/lib/checkout-config";
import { CheckoutError, createOrderCheckout } from "@/lib/checkout";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

function unavailable() {
  return NextResponse.json(
    { error: "payments_not_configured", message: CHECKOUT_UNAVAILABLE_MESSAGE },
    { status: 503, headers: NO_STORE },
  );
}

// Fails closed before catalogue access, persistence or any supplier request.
export async function POST(request: Request) {
  if (!CHECKOUT_AVAILABLE || !process.env.ZENO_API_KEY?.trim()) return unavailable();

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json(
      { error: "invalid_json", message: "A JSON body is required" },
      { status: 400, headers: NO_STORE },
    );
  }

  try {
    const result = await createOrderCheckout(payload, { origin: new URL(request.url).origin });
    return NextResponse.json({ data: result }, { status: 201, headers: NO_STORE });
  } catch (error) {
    if (error instanceof CheckoutError) {
      return NextResponse.json(
        { error: error.code, message: error.message },
        { status: error.status, headers: NO_STORE },
      );
    }
    return NextResponse.json(
      { error: "checkout_failed", message: "Checkout could not be started. No payment was taken." },
      { status: 502, headers: NO_STORE },
    );
  }
}
