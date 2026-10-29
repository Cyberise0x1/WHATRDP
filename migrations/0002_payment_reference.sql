-- Additive migration: retain the historical field for data/rollback auditing.
-- Never rewrite 0001 or discard existing payment references.
ALTER TABLE orders ADD COLUMN payment_reference TEXT;
ALTER TABLE orders ADD COLUMN currency TEXT NOT NULL DEFAULT 'USD';
UPDATE orders SET payment_reference = stripe_session;
CREATE INDEX idx_orders_payment_reference ON orders(payment_reference);
