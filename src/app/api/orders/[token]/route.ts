import { NextResponse } from "next/server";
import { getOrderByToken } from "@/lib/store";
import { powerStateIsFresh, publicOrder, refreshOrderState } from "@/lib/orders";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Read-only. Fulfilment is owned by the provisioning Workflow; a GET must never
// create a billable supplier server.
export async function GET(_request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  const order = await getOrderByToken(token);
  if (!order) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const sync = new URL(_request.url).searchParams.get("sync") === "1";
  let current = order;
  let power: string | null = current.power_state;

  try {
    if (
      current.status === "PROVISIONING" ||
      (sync && current.service_id && !powerStateIsFresh(current))
    ) {
      const state = await refreshOrderState(current, sync, { recordError: !sync });
      current = state.order;
      power = state.power;
    }
  } catch {
    // status is still returned; the stored error is surfaced to the client
  }

  return NextResponse.json(
    { data: publicOrder(current, power) },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
