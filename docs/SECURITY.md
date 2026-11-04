# Security

## Current limitations

Checkout and fulfilment are enabled in both environments (D-018, D-019, D-032)
after one staging order was verified end to end. The server-side guard that
forced production closed (D-024) has been removed; production was released on
2026-11-02. A five-minute reconciliation run handles stuck orders (D-020).

When the supplier reports a linked server as deleted (`404`), the order is marked
`CANCELLED` and its stored IP, username and encrypted password are removed; the
order page no longer reveals credentials. Other supplier read failures remain
retryable and never cancel an order.

Order URLs are **bearer credentials**: anyone with a valid link can view that
order and, once `ACTIVE`, its revealed server credentials and power controls
(start, reboot, graceful shutdown and force-off). The owner accepted bearer
links as the access model for the controlled pilot (D-022, extended by D-039);
customer accounts and ownership checks remain future hardening, not a current
feature. Delete, reinstall, rescue, console access and password reset are not
exposed through the order link. Power actions are rate-limited per order to one
accepted request per 10 seconds and recorded in the `power_actions` audit table
(order id, action, outcome and timestamps only; never credentials or tokens).
Panel power reads are cached for 10 seconds to bound supplier API usage.
Responses and pages are `private, no-store` with `no-referrer` and
`X-Robots-Tag: noindex`, and order tokens must never be logged or shared.
A per-IP checkout rate limit and Turnstile verification are deployed (D-023);
both Turnstile keys are configured on staging and production. Operational
alerting is implemented (D-028/D-029); staff access controls remain out of scope
for the pilot.

## Secrets and stored data

- Runtime bindings: `RDP_MONSTER_API_TOKEN`, `APP_SECRET`, `RDPM_WEBHOOK_SECRET`,
  `ZENO_WEBHOOK_SECRET`, the optional `ALERT_WEBHOOK_URL`, and the Cloudflare
  Email Service `EMAIL` send binding with `EMAIL_FROM` / `PUBLIC_BASE_URL` vars.
- Credential email deliberately contains the server password (owner decision,
  D-031). It is sent over provider TLS but is stored by the recipient's mail
  service and survives forwarding: treat the mailbox as part of the credential.
  The order page remains available, and support can reset the password on
  request. Never log the address, token, password or the rendered message.
- Map the existing supplier API key to the expected binding through approved
  secret configuration. The supplier login email/password are not required.
- Never expose these values in source, `NEXT_PUBLIC_*`, workflow YAML, artifacts,
  screenshots, emails or logs.
- Preserve `APP_SECRET` for existing encrypted records. Never rotate it casually.
- `ALERT_WEBHOOK_URL` is itself a capability: anyone holding it can post to the
  alert channel. Keep it in the Worker secret store, and keep alert payloads free
  of customer data, order tokens and credentials (the alert module enforces the
  last part).
- Order links, exports, databases and credential ciphertext are customer data.
  Exports remain under ignored `generated-artifacts/` with exclusive mode-0600
  files; they must never be committed or publicly hosted.

The example environment contains placeholders only. Replit, GitHub and Worker
secrets are separate stores; values are not automatically transferred.

## GitHub Actions

PR checks have read-only contents permission and no deployment credentials. Do
not use `pull_request_target` for untrusted source or download untrusted artifacts
in privileged release jobs. The workflows use pinned action revisions.
Failure artifacts include credential-free test/build logs only, not databases,
exports or fixture bundles.

Deployment credentials are scoped to separate protected environments, available
only to deployment steps. Production uses a separately protected, repository-scoped
`PRODUCTION_POLICY_READ_TOKEN` with Administration (read), not the default
workflow token, to verify that required-reviewer protection actually exists.
It fails closed if that credential, the account plan or the API cannot provide it.
Do not replace that guard with a boolean claiming approvals were configured.

## Repository distribution

Local transcripts/settings and stale operational snapshots were untracked, not
deleted from the user's filesystem. The cleanup does not rewrite history.
Filename-only credential-pattern checks cannot prove no historical disclosure
occurred. Before making an existing repository public, the owner should review
its history with a secret scanner and approve any needed rotation/history
remediation separately. No credentials were read out, printed or rotated here.

Report security issues privately to the repository owner rather than opening an
issue containing credentials or customer data.
