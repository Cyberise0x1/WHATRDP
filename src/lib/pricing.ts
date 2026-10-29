export const CYCLES = ["MONTHLY", "QUARTERLY", "SEMIANNUALLY", "ANNUALLY"] as const;
export type Cycle = (typeof CYCLES)[number];

export const CYCLE_MONTHS: Record<Cycle, number> = {
  MONTHLY: 1,
  QUARTERLY: 3,
  SEMIANNUALLY: 6,
  ANNUALLY: 12,
};

export function multiplier(): number {
  const raw = Number(process.env.RETAIL_MULTIPLIER ?? "1.7");
  return Number.isFinite(raw) && raw >= 1 ? raw : 1.7;
}

export function retailCents(listCents: number): number {
  const raw = listCents * multiplier();
  const dollars = Math.ceil(raw / 100);
  return Math.max(99, dollars * 100 - 1);
}

export function costCents(listCents: number, discountPercent: number): number {
  return Math.round(listCents * (1 - discountPercent / 100));
}

export function marginCents(listCents: number, discountPercent: number): number {
  return retailCents(listCents) - costCents(listCents, discountPercent);
}

export function formatUsd(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export function perMonth(cents: number, cycle: Cycle): string {
  return formatUsd(Math.round(cents / CYCLE_MONTHS[cycle]));
}

export function isCycle(value: string): value is Cycle {
  return (CYCLES as readonly string[]).includes(value);
}
