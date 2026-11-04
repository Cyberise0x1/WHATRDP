import { NextResponse } from "next/server";
import { loadShopCatalog } from "@/lib/catalog";
import { ApiError } from "@/lib/rdpmonster";
import { raiseAlert } from "@/lib/alerts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { plans, discountPercent } = await loadShopCatalog();
    return NextResponse.json({
      data: plans.map((plan) => ({
        sku: plan.sku,
        name: plan.name,
        product: plan.product,
        region: plan.region,
        tier: plan.tier,
        cpuCores: plan.cpuCores,
        ramMb: plan.ramMb,
        diskGb: plan.diskGb,
        retail: plan.retail,
        retailMonthly: plan.retailMonthly,
      })),
      meta: { discountPercent },
    });
  } catch (error) {
    // Supplier status and auth failures are already alerted by the API client;
    // this covers malformed or unexpected catalogue failures.
    if (!(error instanceof ApiError)) {
      raiseAlert({
        code: "catalog_unavailable",
        severity: "warning",
        message: "The catalogue could not be assembled",
      });
    }
    console.error(
      JSON.stringify({
        event: "catalog_unavailable",
        message: error instanceof Error ? error.message : "Unknown error",
      }),
    );
    return NextResponse.json(
      {
        error: "catalog_unavailable",
        message: "The catalogue is temporarily unavailable",
      },
      { status: 502 },
    );
  }
}
