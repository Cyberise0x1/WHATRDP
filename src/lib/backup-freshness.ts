import type { SqlDatabase } from "./storage/types";
import { raiseAlert, type AlertInput } from "./alerts";

/** A daily backup is still healthy at 26 h; beyond that the schedule slipped. */
export const BACKUP_MAX_AGE_MS = 26 * 60 * 60 * 1000;

export type BackupEnvironment = "staging" | "production";
export type BackupFreshness = "fresh" | "stale" | "missing" | "skipped" | "unavailable";

export interface BackupFreshnessDeps {
  now?: Date;
  alert?: (input: AlertInput) => unknown;
}

export function backupEnvironment(target: string | null | undefined): BackupEnvironment | null {
  if (target === "cloudflare-production" || target === "production") return "production";
  if (target === "cloudflare-staging" || target === "staging") return "staging";
  return null;
}

/**
 * Read the latest backup heartbeat and alert when it is missing or older than
 * 26 hours. Runs from the five-minute scheduled handler.
 *
 * The heartbeat is written by the backup workflow only after a verified upload,
 * so a fresh row proves an object existed; the Worker never needs R2 access.
 */
export async function checkBackupFreshness(
  db: SqlDatabase,
  target: string | null | undefined = process.env.DEPLOYMENT_TARGET,
  deps: BackupFreshnessDeps = {},
): Promise<BackupFreshness> {
  const environment = backupEnvironment(target);
  if (!environment) return "skipped";

  const alert = deps.alert ?? ((input: AlertInput) => raiseAlert(input));
  const now = deps.now ?? new Date();

  let row: { exported_at: string } | null;
  try {
    row = await db
      .prepare(
        "SELECT exported_at FROM backup_heartbeat WHERE environment = ? ORDER BY exported_at DESC LIMIT 1",
      )
      .bind(environment)
      .first<{ exported_at: string }>();
  } catch {
    alert({
      code: "backup_freshness_unavailable",
      severity: "critical",
      message: "The backup heartbeat could not be read",
      context: { environment },
      cooldownMs: 6 * 60 * 60 * 1000,
    });
    return "unavailable";
  }

  if (!row) {
    alert({
      code: "backup_stale",
      severity: "critical",
      message: "No verified D1 backup has been recorded for this environment",
      context: { environment },
      cooldownMs: 6 * 60 * 60 * 1000,
    });
    return "missing";
  }

  const exportedAt = Date.parse(row.exported_at);
  if (!Number.isFinite(exportedAt)) {
    alert({
      code: "backup_freshness_unavailable",
      severity: "warning",
      message: "The latest backup heartbeat has an invalid timestamp",
      context: { environment },
      cooldownMs: 6 * 60 * 60 * 1000,
    });
    return "unavailable";
  }

  const ageMs = now.getTime() - exportedAt;
  if (ageMs > BACKUP_MAX_AGE_MS) {
    alert({
      code: "backup_stale",
      severity: "critical",
      message: "The latest verified D1 backup is more than 26 hours old",
      context: {
        environment,
        ageHours: Math.floor(ageMs / 3_600_000),
        lastBackupAt: row.exported_at,
      },
      cooldownMs: 6 * 60 * 60 * 1000,
    });
    return "stale";
  }

  return "fresh";
}
