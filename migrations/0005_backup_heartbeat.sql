-- A heartbeat row is written only after a D1 export has been verified and both
-- objects (dump + manifest) exist in R2. The scheduled Worker reads the latest
-- row per environment and alerts when it is older than 26 hours.
--
-- Forward-only. The backup job writes to this table, so apply the migration
-- before the next scheduled backup or the run fails at the heartbeat step.
CREATE TABLE IF NOT EXISTS backup_heartbeat (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  environment TEXT NOT NULL,
  exported_at TEXT NOT NULL,
  sql_key TEXT NOT NULL,
  sha256 TEXT NOT NULL,
  bytes INTEGER NOT NULL,
  recorded_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS idx_backup_heartbeat_environment
  ON backup_heartbeat(environment, exported_at DESC);
