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
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_orders_service ON orders(service_id);
CREATE INDEX IF NOT EXISTS idx_orders_payment_reference ON orders(payment_reference);
`;
