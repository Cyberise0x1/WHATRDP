import { NextResponse } from "next/server";
import { CHECKOUT_UNAVAILABLE_MESSAGE } from "@/lib/checkout";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Fail before catalogue access, persistence or any supplier request.
export function POST() {
  return NextResponse.json(
    { error: "payments_not_configured", message: CHECKOUT_UNAVAILABLE_MESSAGE },
    { status: 503, headers: { "Cache-Control": "no-store" } },
  );
}
