import { getCatalog, type Catalog, type CatalogPlan } from "./rdpmonster";
import { CYCLE_MONTHS, costCents as computeCost, retailCents, type Cycle } from "./pricing";

export interface ShopPlan extends CatalogPlan {
  retail: Record<string, number>;
  cost: Record<string, number>;
  retailMonthly: number;
  marginPercent: number;
}

export interface ShopCatalog {
  catalog: Catalog;
  discountPercent: number;
  plans: ShopPlan[];
}

const SHOP_CYCLES: Cycle[] = ["MONTHLY", "QUARTERLY", "SEMIANNUALLY", "ANNUALLY"];

export async function loadShopCatalog(): Promise<ShopCatalog> {
  const catalog = await getCatalog();
  const discountPercent = catalog.resellerTier?.discountPercent ?? 0;

  const plans = catalog.plans.map((plan) => {
    const retail: Record<string, number> = {};
    const cost: Record<string, number> = {};

    for (const cycle of SHOP_CYCLES) {
      const listPrice = plan.priceCents[cycle];
      if (typeof listPrice !== "number") continue;
      retail[cycle] = retailCents(listPrice);
      cost[cycle] = computeCost(listPrice, discountPercent);
    }

    const monthlyRetail = retail.MONTHLY ?? retailCents(plan.priceCents.MONTHLY);
    const monthlyCost = cost.MONTHLY ?? computeCost(plan.priceCents.MONTHLY, discountPercent);

    return {
      ...plan,
      retail,
      cost,
      retailMonthly: monthlyRetail,
      marginPercent: monthlyRetail > 0 ? Math.round(((monthlyRetail - monthlyCost) / monthlyRetail) * 100) : 0,
    };
  });

  return { catalog, discountPercent, plans };
}

export function priceForCycle(plan: ShopPlan, cycle: Cycle): number {
  const listed = plan.retail[cycle];
  if (typeof listed === "number") return listed;
  return Math.round(plan.retail.MONTHLY * (CYCLE_MONTHS[cycle] / CYCLE_MONTHS.MONTHLY));
}
