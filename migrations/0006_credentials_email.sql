-- Additive, forward-only: track credential-email delivery per order.
-- Existing rows start unsent; orders without an email are never emailed.
-- Rollback: the columns are ignored by older code and can stay in place.
ALTER TABLE orders ADD COLUMN credentials_emailed_at TEXT;
ALTER TABLE orders ADD COLUMN credentials_email_attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN credentials_email_last_attempt_at TEXT;
