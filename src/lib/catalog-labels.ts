const REGION_NAMES: Record<string, string> = {
  europe: "Europe",
  usa: "United States",
};

const REGION_CODES: Record<string, string> = {
  europe: "EU",
  usa: "US",
};

const TIER_NAMES: Record<string, string> = {
  CLASSIC: "Standard",
  HIGH_PERFORMANCE: "High performance",
};

const TIER_CODES: Record<string, string> = {
  CLASSIC: "STANDARD",
  HIGH_PERFORMANCE: "HIGH PERF",
};

const REGION_ORDER = ["europe", "usa"];
const TIER_ORDER = ["CLASSIC", "HIGH_PERFORMANCE"];

export function regionName(region: string): string {
  return REGION_NAMES[region] ?? region;
}

export function regionCode(region: string): string {
  return REGION_CODES[region] ?? region.toUpperCase();
}

export function tierName(tier: string): string {
  return TIER_NAMES[tier] ?? tier;
}

export function tierCode(tier: string): string {
  return TIER_CODES[tier] ?? tier.toUpperCase();
}

function orderIndex(order: string[], value: string): number {
  const index = order.indexOf(value);
  return index === -1 ? order.length : index;
}

export function sortRegions(a: string, b: string): number {
  return orderIndex(REGION_ORDER, a) - orderIndex(REGION_ORDER, b);
}

export function sortTiers(a: string, b: string): number {
  return orderIndex(TIER_ORDER, a) - orderIndex(TIER_ORDER, b);
}
