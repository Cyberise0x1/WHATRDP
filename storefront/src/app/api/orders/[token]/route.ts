import { NextResponse } from "next/server";
import { getOrderByToken } from "@/lib/store";
import { provisionOrder, publicOrder, syncOrder } from "@/lib/orders";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ token: string }> },
) {
  const { token } = await context.params;
  const order = await getOrderByToken(token);
  if (!order) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  let current = order;

  try {
    if (current.status === "PAID") {
      current = await provisionOrder(current);
    }
    if (current.status === "PROVISIONING" || current.service_id) {
      current = await syncOrder(current);
    }
  } catch {
    // status is still returned; the stored error is surfaced to the client
  }

  return NextResponse.json({ data: publicOrder(current) }, { headers: { "Cache-Control": "private, no-store" } });
}
