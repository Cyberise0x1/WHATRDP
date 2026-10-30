-- Additive: record the charged currency and amount independently of the USD
-- cost basis, so USD and NGN checkouts are validated against what was actually
-- charged. Never edit 0001/0002. Forward-only; older code keeps reading
-- amount_cents/currency, and the new columns are nullable.
ALTER TABLE orders ADD COLUMN charge_currency TEXT;
ALTER TABLE orders ADD COLUMN charge_amount_minor INTEGER;
ALTER TABLE orders ADD COLUMN fx_rate TEXT;
ALTER TABLE orders ADD COLUMN quote_expires_at TEXT;
UPDATE orders SET charge_currency = currency, charge_amount_minor = amount_cents WHERE charge_currency IS NULL;
CREATE INDEX IF NOT EXISTS idx_orders_charge ON orders(charge_currency);
