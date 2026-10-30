-- Zeno webhooks are at-least-once. Record processed deliveries so a replay is
-- acknowledged without side effects. Payment settling stays idempotent through
-- claimPayment regardless. Forward-only.
CREATE TABLE IF NOT EXISTS webhook_events (
  svix_id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  created_at TEXT NOT NULL
);
