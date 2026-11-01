// Fresh local databases use the current schema. Historical databases require
// the reviewed forward migration; this bootstrap must not rewrite user data.
export const SCHEMA = `
CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  token TEXT UNIQUE NOT NULL,
  plan_sku TEXT NOT NULL,
  os TEXT NOT NULL,
  cycle TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING_PAYMENT',
  email TEXT,
  service_id TEXT,
  primary_ip TEXT,
  username TEXT,
  password_enc TEXT,
  error TEXT,
  payment_reference TEXT,
  currency TEXT NOT NULL DEFAULT 'USD',
  charge_currency TEXT,
  charge_amount_minor INTEGER,
  fx_rate TEXT,
  quote_expires_at TEXT,
  credentials_emailed_at TEXT,
  credentials_email_attempts INTEGER NOT NULL DEFAULT 0,
  credentials_email_last_attempt_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_orders_service ON orders(service_id);
CREATE INDEX IF NOT EXISTS idx_orders_payment_reference ON orders(payment_reference);
CREATE TABLE IF NOT EXISTS webhook_events (
  svix_id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  created_at TEXT NOT NULL
);
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
`;
