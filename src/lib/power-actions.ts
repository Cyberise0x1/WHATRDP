export const POWER_ACTIONS = ["start", "reboot", "shutdown", "stop"] as const;

export type PowerAction = (typeof POWER_ACTIONS)[number];

export const POWER_ACTION_COOLDOWN_MS = 10_000;
export const POWER_REFRESH_INTERVAL_MS = 10_000;

export function isPowerAction(value: unknown): value is PowerAction {
  return typeof value === "string" && (POWER_ACTIONS as readonly string[]).includes(value);
}
