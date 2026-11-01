# Operational monitoring and alerts

Status: implemented in the Worker and the backup workflow. Migration `0005` is
applied to staging and production (2026-11-01), and the `ALERT_WEBHOOK_URL`
Worker secret is set on both (Telegram, verified with a test message). No
vendor, agent or extra Cloudflare resource is required.

## Delivery

Every alert is always written to Workers Logs as one structured line:

```json
{
  "event": "operational_alert",
  "code": "supplier_auth_failed",
  "severity": "critical",
  "message": "The supplier API rejected our credentials",
  "context": { "status": 401, "method": "GET", "path": "/catalog" },
  "at": "2026-11-01T08:35:00.000Z"
}
```

When the Worker secret `ALERT_WEBHOOK_URL` is set, the same alert is also
POSTed to that URL. The provider is detected from the host:

| Host               | Body                                      |
| ------------------ | ----------------------------------------- |
| `*.slack.com`      | `{ "text": "…" }`                         |
| `*.discord.com`    | `{ "content": "…" }` (truncated to 1,900) |
| `api.telegram.org` | `{ "chat_id": "…", "text": "…" }`         |
| anything else      | `{ "text": "…", "alert": { … } }`         |

Telegram reads `chat_id` from the URL query, for example
`https://api.telegram.org/bot<token>/sendMessage?chat_id=<id>`. The bot token is
part of the URL; it is never logged.

Alerts never block or fail a request:

- The structured log line is written synchronously.
- Webhook delivery is handed to `ctx.waitUntil` with a 3-second timeout, or
  fire-and-forget in Node dev. Delivery failures are swallowed.
- A per-isolate cooldown suppresses repeated webhook posts for the same code
  (five minutes by default; backup and reconcile failures use longer windows).
  Every occurrence is still logged.

Alerts never include tokens, order tokens, passwords, signatures or customer
emails. Callers pass only safe scalar context; the alert module drops sensitive
keys and masks email addresses and `rdpm_`/`sk_`/`whsec_`-style values.

## Events

| Code                                | Severity | Raised when                                                             |
| ----------------------------------- | -------- | ----------------------------------------------------------------------- |
| `supplier_token_missing`            | critical | `RDP_MONSTER_API_TOKEN` is not configured                               |
| `supplier_unreachable`              | critical | supplier request timed out or the connection failed                     |
| `supplier_auth_failed`              | critical | supplier returned `401` or `403` (dead/revoked token)                   |
| `supplier_balance_exhausted`        | critical | supplier returned `402` or `insufficient_balance`                       |
| `supplier_5xx`                      | warning  | supplier returned `5xx` after read retries                              |
| `catalog_unavailable`               | warning  | catalogue assembly failed for a non-supplier reason                     |
| `checkout_failed`                   | critical | checkout failed unexpectedly                                            |
| `checkout_blocked_supplier_balance` | critical | live balance is below the plan cost plus `SUPPLIER_RESERVE_CENTS`       |
| `supplier_balance_unavailable`      | critical | the supplier account payload could not be read                          |
| `gateway_not_configured`            | critical | `ZENO_API_KEY` is missing                                               |
| `gateway_unreachable`               | critical | Zeno could not be reached                                               |
| `gateway_checkout_failed`           | critical | Zeno rejected checkout creation                                         |
| `provisioning_failed`               | critical | definite supplier rejection, `402`, or a terminal supplier failure      |
| `provisioning_review_required`      | critical | uncertain create outcome or an interrupted claim needs a human          |
| `provision_dispatch_failed`         | critical | the Workflow could not be dispatched for a paid order                   |
| `reconcile_sync_failed`             | warning  | an order could not be re-synced (at most hourly)                        |
| `webhook_secret_missing`            | critical | a webhook signing secret is not configured                              |
| `webhook_invalid_payload`           | warning  | a verified webhook body was malformed                                   |
| `webhook_invalid_amount`            | warning  | a verified payment carried an invalid amount                            |
| `payment_unmatched`                 | critical | a verified payment matched no order                                     |
| `payment_mismatch`                  | critical | a verified payment did not match the order amount or currency           |
| `zeno_webhook_failed`               | critical | a verified Zeno webhook could not be processed                          |
| `supplier_webhook_unmatched`        | warning  | a verified supplier webhook referenced an unknown service               |
| `supplier_webhook_failed`           | critical | a verified supplier webhook could not be processed                      |
| `supplier_payment_failed`           | critical | the supplier reported a failed payment                                  |
| `email_not_configured`              | critical | a ready server needs its credentials emailed but Email Service is unset |
| `credentials_email_failed`          | warning  | a credential email attempt failed and will be retried                   |
| `credentials_email_exhausted`       | critical | all three credential-email attempts failed; send manually               |
| `backup_stale`                      | critical | no heartbeat, or the latest verified backup is older than 26 h          |
| `backup_freshness_unavailable`      | critical | the heartbeat table could not be read (at most every six hours)         |

Invalid signatures are deliberately not alerted: anyone can POST them, and they
would become an alert-spam channel. They are rejected with `401`.

## Backup freshness

The Worker cannot list the private R2 buckets and does not get R2 access. Instead:

1. The backup workflow exports, verifies and uploads both objects, then inserts
   a row into `backup_heartbeat` (`environment`, `exported_at`, `sql_key`,
   `sha256`, `bytes`).
2. The five-minute Worker cron reads the latest row for its environment and
   raises `backup_stale` when the row is missing or older than **26 hours**.

A failed heartbeat insert is logged by the backup run but does not fail it: the
dump is already safe, and the Worker's freshness check then alerts because the
heartbeat stops moving. Apply `migrations/0005_backup_heartbeat.sql` before the
next scheduled backup, otherwise every run reports a lost heartbeat.

See [Backups](BACKUPS.md) for the export, verification and restore drill.

### First rollout order

Migration `0005` is already applied to both D1 databases (2026-11-01). To avoid
a false `backup_stale` alert, seed a heartbeat before the Worker that runs the
check is deployed:

1. Merge/deploy the backup script that writes the heartbeat.
2. Run **Actions → Backup D1 to R2 → Run workflow** once (or wait for 03:17 UTC).
3. Deploy the Worker that enables the five-minute freshness check.

If the Worker runs first, expect `backup_stale` until the first backup with the
heartbeat completes; that is accurate, not data loss.

## Configuration

The webhook is optional:

```sh
# Per environment, set out of band; never in source or chat.
npx wrangler secret put ALERT_WEBHOOK_URL --config generated-artifacts/deployment/wrangler.json
```

Without it, alerts exist only as `operational_alert` lines in Workers Logs. The
same code is used for local Node runs through `process.env.ALERT_WEBHOOK_URL`
(see `.env.example`); leave it empty locally.

## Rollback

`backup_heartbeat` is additive. The previous Worker ignores it, and the previous
backup script simply stops writing it; neither rollback affects uploaded dumps.
A new Worker paired with an old backup script raises `backup_stale` after 26
hours, which is the correct signal rather than data loss. Do not drop the table
while freshness monitoring is deployed.

## Tests

`tests/unit/alerts.test.ts` covers redaction, provider payloads, the log-only
path, throttling and best-effort delivery. `tests/unit/backup-freshness.test.ts`
covers fresh, stale, missing, unreadable and skipped environments.
`tests/unit/backup.test.ts` covers the heartbeat write and its failure mode.
`tests/unit/email.test.ts` covers the rendered message, the single-send claim,
missing configuration and the bounded failure alerts.
