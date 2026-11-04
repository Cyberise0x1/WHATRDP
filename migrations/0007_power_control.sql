-- Power controls: cached live state and a durable per-order audit/throttle.
-- Additive and nullable; rollback may drop the table and columns after the
-- power-action route is removed.
ALTER TABLE orders ADD COLUMN power_state TEXT;
ALTER TABLE orders ADD COLUMN power_checked_at TEXT;

CREATE TABLE IF NOT EXISTS power_actions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL,
  action TEXT NOT NULL,
  outcome TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_power_actions_order_created
  ON power_actions(order_id, created_at DESC);
