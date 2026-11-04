import { NextResponse } from "next/server";
import { performPowerAction } from "@/lib/order-actions";
import { publicOrder } from "@/lib/orders";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "private, no-store" };

export async function POST(request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json(
      { error: "invalid_json", message: "A JSON body is required" },
      { status: 400, headers: NO_STORE },
    );
  }

  const result = await performPowerAction(token, payload);
  if (!result.ok) {
    const headers = result.retryAfter
      ? { ...NO_STORE, "Retry-After": String(result.retryAfter) }
      : NO_STORE;
    return NextResponse.json(
      { error: result.error, message: result.message },
      { status: result.status, headers },
    );
  }

  return NextResponse.json(
    { data: publicOrder(result.order, result.power) },
    { headers: NO_STORE },
  );
}
