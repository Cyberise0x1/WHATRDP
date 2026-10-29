# Security

## Current limitations

Paid checkout is unavailable in every environment. No gateway is implemented.
Existing order URLs are bearer credentials: anyone with a valid link can see
its order and revealed server credentials. Customer authentication/authorization,
staff access controls, abuse/rate limiting and durable reconciliation must be
completed before public sales.

## Secrets and stored data

- Runtime bindings: `RDP_MONSTER_API_TOKEN`, `APP_SECRET`, `RDPM_WEBHOOK_SECRET`.
- Map the existing supplier API key to the expected binding through approved
  secret configuration. The supplier login email/password are not required.
- Never expose these values in source, `NEXT_PUBLIC_*`, workflow YAML, artifacts,
  screenshots, emails or logs.
- Preserve `APP_SECRET` for existing encrypted records. Never rotate it casually.
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
