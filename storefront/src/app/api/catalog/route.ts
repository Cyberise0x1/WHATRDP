import { NextResponse } from "next/server";
import { loadShopCatalog } from "@/lib/catalog";

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
    return NextResponse.json(
      { error: "catalog_unavailable", message: error instanceof Error ? error.message : "Unknown error" },
      { status: 502 },
    );
  }
}
