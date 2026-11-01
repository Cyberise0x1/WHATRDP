import { test } from "node:test";
import assert from "node:assert/strict";
import {
  BACKUP_MAX_AGE_MS,
  backupEnvironment,
  checkBackupFreshness,
} from "../../src/lib/backup-freshness";
import type { AlertInput } from "../../src/lib/alerts";
import type { SqlDatabase, SqlStatement } from "../../src/lib/storage/types";

const NOW = new Date("2026-11-01T12:00:00.000Z");

function database(row: { exported_at: string } | null, throws = false): SqlDatabase {
  const statement: SqlStatement = {
    bind() {
      return statement;
    },
    async first<T>() {
      if (throws) throw new Error("no such table: backup_heartbeat");
      return row as T | null;
    },
    async all<T>() {
      return { results: [] as T[] };
    },
  };
  return { prepare: () => statement };
}

function recorder() {
  const alerts: AlertInput[] = [];
  return {
    alerts,
    alert: (input: AlertInput) => {
      alerts.push(input);
    },
  };
}

test("environment mapping only recognises deployed targets", () => {
  assert.equal(backupEnvironment("cloudflare-staging"), "staging");
  assert.equal(backupEnvironment("cloudflare-production"), "production");
  assert.equal(backupEnvironment("production"), "production");
  assert.equal(backupEnvironment(undefined), null);
  assert.equal(backupEnvironment("local"), null);
});

test("a backup inside the 26-hour window is healthy and silent", async () => {
  const recorded = recorder();
  const result = await checkBackupFreshness(
    database({ exported_at: new Date(NOW.getTime() - 25 * 3_600_000).toISOString() }),
    "cloudflare-staging",
    { now: NOW, alert: recorded.alert },
  );
  assert.equal(result, "fresh");
  assert.deepEqual(recorded.alerts, []);
});

test("a backup older than 26 hours alerts with its age", async () => {
  const recorded = recorder();
  const lastBackupAt = new Date(NOW.getTime() - 27 * 3_600_000).toISOString();
  const result = await checkBackupFreshness(
    database({ exported_at: lastBackupAt }),
    "cloudflare-production",
    { now: NOW, alert: recorded.alert },
  );
  assert.equal(result, "stale");
  assert.equal(recorded.alerts.length, 1);
  assert.equal(recorded.alerts[0].code, "backup_stale");
  assert.equal(recorded.alerts[0].severity, "critical");
  assert.deepEqual(recorded.alerts[0].context, {
    environment: "production",
    ageHours: 27,
    lastBackupAt,
  });
});

test("a missing heartbeat is treated as a stale backup", async () => {
  const recorded = recorder();
  const result = await checkBackupFreshness(database(null), "cloudflare-staging", {
    now: NOW,
    alert: recorded.alert,
  });
  assert.equal(result, "missing");
  assert.equal(recorded.alerts[0].code, "backup_stale");
  assert.match(String(recorded.alerts[0].message), /No verified D1 backup/);
});

test("an unreadable heartbeat table does not break the scheduled handler", async () => {
  const recorded = recorder();
  const result = await checkBackupFreshness(database(null, true), "cloudflare-staging", {
    now: NOW,
    alert: recorded.alert,
  });
  assert.equal(result, "unavailable");
  assert.equal(recorded.alerts[0].code, "backup_freshness_unavailable");
  assert.equal(recorded.alerts[0].severity, "critical");
});

test("non-deployed environments skip the check entirely", async () => {
  const recorded = recorder();
  const result = await checkBackupFreshness(database(null), undefined, {
    now: NOW,
    alert: recorded.alert,
  });
  assert.equal(result, "skipped");
  assert.deepEqual(recorded.alerts, []);
  assert.equal(BACKUP_MAX_AGE_MS, 26 * 60 * 60 * 1000);
});
