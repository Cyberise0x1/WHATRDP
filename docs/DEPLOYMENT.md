# GitHub and Cloudflare deployment

## Status and prerequisites

**Live resources (updated 2026-11-02).** Both environments are released.
Production serves `https://whatrdp.com` from Worker `whatrdp-production` with D1
`whatrdp-production` (migrations 0001–0006 verified remotely; `0006` applied
2026-11-01). The power-control migration `0007` is pending on both databases and
must be applied before the release that includes the power controls. The public
`*.workers.dev` route is disabled and the custom domain holds the TLS
certificate. Staging serves
`https://whatrdp-staging.cyberise2020.workers.dev`. Worker secrets
`APP_SECRET`, `RDP_MONSTER_API_TOKEN`, `RDPM_WEBHOOK_SECRET`, `ZENO_API_KEY`,
`ZENO_WEBHOOK_SECRET`, `TURNSTILE_SECRET_KEY` and `ALERT_WEBHOOK_URL` are set on
both through the dashboard (Telegram, 2026-11-01). Credential email uses the
Cloudflare Email Service `send_email` binding (`EMAIL`); the domain is onboarded
and `EMAIL_FROM` is set. The storefront renders and `/api/catalog` returns 200.
Staging ran one real order (order 4, $15.99 USDC) to `ACTIVE` and delivered its
credential email on 2026-11-02. Production was released through **Deploy
production** at `0046808` (Worker version `2b821f4f`, 2026-11-02) with checkout
and fulfilment enabled (D-032, D-033).

Production was previously released through `Deploy production` at `8fb6d7c`
(Worker version `dc640df8`, 2026-11-01) with credential-email support. The
earlier `c6e4784` release established the environment gate (required reviewer,
`PRODUCTION_POLICY_READ_TOKEN`, typed `DEPLOY`). `www.whatrdp.com` has **no** DNS
record and does not resolve — only the apex is attached. The checked-in D1 ID is
local-only; real IDs live in repository variables.

Both workflows are enabled and have run; production was released manually through
the gated workflow.

The owner must separately approve repository connection, staging resources,
least-privilege credentials and any publishing. Checkout follows the reviewed
switch; hosting setup is not launch readiness.

**Release authority (updated 2026-10-30).** The repository is now **public** on
GitHub Free. That makes environments, environment secrets, deployment branch
policies, branch protection and required reviewers available: the `staging` and
`production` environments are configured with a `main`-only deployment policy, and
`main` requires the **Repository checks** status check. Production additionally has
a required reviewer and still needs a `PRODUCTION_POLICY_READ_TOKEN` with
repository Administration (read); until that secret exists the
`verify-production-policy` step fails closed. Do not weaken the guard. Note that
publication makes all tracked source and `.agents/memory/` publicly visible; a
secret-pattern scan of tracked files and history found none, but the owner should
still run a dedicated history scanner before treating publication as safe.

## 1. GitHub checks

Push the reviewed source to the owner's chosen repository only after approval.
CI runs on pull requests and main pushes. Set main-branch protection to require
pull-request review and **Repository checks** from the CI workflow; confirm its
exact check label after the first successful real run.

CI uses Node 22.23.4, `npm ci`, deterministic local commands and mock-only tests.
No Cloudflare/supplier credentials are needed. Do not enable a second
Cloudflare Git deployment integration alongside Actions; use one release authority.

## 2. Separate resources and environments

Create GitHub environments `staging` and `production`. Restrict both to main;
configure **required reviewers** for production before enabling deployment.
Production also makes a read-only GitHub API check for a nonempty required-reviewer
policy. If the account/repository plan or token permissions cannot support it,
releases remain blocked—there is no unsafe fallback.

Provision distinct Workers and D1 databases after approval. Names must end in
`-staging` and `-production`. Set repository variables:

| Variable                        | Meaning                                                                                                                         |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `STAGING_WORKER_NAME`           | Approved Worker name ending `-staging`                                                                                          |
| `STAGING_D1_DATABASE_NAME`      | Approved database name ending `-staging`                                                                                        |
| `STAGING_D1_DATABASE_ID`        | Actual staging UUID, never the local placeholder                                                                                |
| `PRODUCTION_WORKER_NAME`        | Approved Worker name ending `-production`                                                                                       |
| `PRODUCTION_D1_DATABASE_NAME`   | Approved database name ending `-production`                                                                                     |
| `PRODUCTION_D1_DATABASE_ID`     | Different actual production UUID                                                                                                |
| `ENABLE_STAGING_DEPLOYMENTS`    | Leave absent/false until staging releases are approved                                                                          |
| `ENABLE_PRODUCTION_DEPLOYMENTS` | Leave absent/false until production policy/resources are approved                                                               |
| `STAGING_HOSTNAME`              | Optional custom domain for staging; when set, the public `*.workers.dev` route is disabled and a custom-domain route is created |
| `PRODUCTION_HOSTNAME`           | Custom domain for production. Set this before a production release; without it the Worker serves only on `*.workers.dev`        |
| `EMAIL_FROM`                    | Verified Cloudflare Email Service sender, e.g. `WHATRDP <orders@whatrdp.com>`. Empty disables credential email                  |
| `STAGING_PUBLIC_BASE_URL`       | Bare `https://` origin used in order links, e.g. the staging `*.workers.dev` URL                                                |
| `PRODUCTION_PUBLIC_BASE_URL`    | Bare `https://` origin used in order links, normally `https://whatrdp.com`                                                      |

### Credential email domain

Onboard `whatrdp.com` under **Email Service** in the Cloudflare dashboard and add
the SPF, DKIM and DMARC records Cloudflare provides; sending to arbitrary
customer addresses requires the Workers Paid plan already used by Workflows.
Keep the records in the same zone as the site. Set `EMAIL_FROM` to an address on
the onboarded domain and the per-environment `*_PUBLIC_BASE_URL`. Without both
the binding and the sender, fulfilment still completes and the order page still
shows credentials; the Worker raises `email_not_configured` instead of sending.

Store **separate** `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` credentials
in each GitHub environment. Limit tokens to the approved account and required
Worker/D1 operations; avoid global account keys.

In the protected **production** GitHub environment, additionally configure
`PRODUCTION_POLICY_READ_TOKEN`: a fine-grained GitHub token limited to this one
repository with **Administration: read** permission, or an equivalent approved
GitHub App installation token. The repository-environments API requires that
permission; `GITHUB_TOKEN` and `deployments: read` cannot provide it. The workflow
does not fall back to either. Set an expiry/rotation owner and never give this
read-only credential write access or scope over unrelated repositories. It is
injected only into the policy verification step, after the environment gate.
Missing, expired or insufficient access stops the release. Use approved secret
configuration; never paste a token into the source or a chat.

Application secrets belong in the corresponding Worker, not build-time
variables or GitHub PR jobs. Transfer only approved supplier/encryption/webhook
secrets through protected provider tooling. Never copy supplier login credentials.
Custom domains and DNS remain a separate approval, not part of these workflows.

## 3. Migrations and data

Migrations are **not automatically applied by CD**. The release job only reads
the selected D1 migration ledger and stops when schema readiness cannot be verified
or a migration is pending. Review and approve migrations separately, take a
backup, and reconcile real orders before any remote change.

`0007_power_control.sql` adds `orders.power_state`, `orders.power_checked_at` and
the `power_actions` audit/throttle table. It is additive and nullable; apply it
to staging and production before the release that includes the power controls.
Rolling back the Worker alone leaves the table and columns in place, which is
safe.

The immutable baseline contains the historical gateway column. The additive
second migration copies it to `payment_reference` and supplies USD currency.
Do not drop historical references or edit an applied migration just to remove an
old name. New gateway migrations must follow the neutral-reference migration.

Original local data remains under its old location when present; it was not moved.
Use a consistent offline SQLite copy, including WAL state, for export:

```text
npm run orders:export -- --offline-copy /approved/offline-copy.db generated-artifacts/orders.sql
```

This command only exports read-only data; it does not import, decrypt or publish.
Protect the output. Test migrations on a disposable copy first. Verify IDs,
counts, payment references, currency, tokens and decryption using the unchanged
encryption key. Never import over an existing database by guess.

### Provisioning Workflow

`custom-worker.ts` is the Worker entry in every environment. Deployment
preparation always points `main` at it — never at the generated
`.open-next/worker.js` or the test fixture — because the generated module only
exports `fetch`. The configuration also declares a per-environment Workflow
(`<worker-name>-provision`, class `ProvisionWorkflow`, binding
`PROVISION_WORKFLOW`). Fulfilment is a per-environment switch,
`FULFILMENT_ENABLED` in `scripts/lib/deployment.ts`; both are `true` since the
reviewed enablement (D-032), so a settled order dispatches the Workflow in either
environment.
The generated deploy configuration always wins over an environment variable or
the checked-in `wrangler.jsonc`; enabling it by configuration is impossible.

Activation order (steps 1–5 done 2026-11-02):

1. Staging only after the supplier balance is funded, reseller products exist
   and `SUPPLIER_RESERVE_CENTS` is set. Balance is $300 (Gold, 25%); reseller
   products remain optional because public SKUs order at the tier discount; the
   reserve stays 0 while there are no renewals to fund.
2. Before merging the flip, review or park any stale `PAID`/`PROVISIONING`
   orders in staging: the five-minute reconcile dispatches them once enabled.
   Staging held only `PENDING_PAYMENT` orders, so nothing was dispatched
   retroactively.
3. Set `staging: true`, update the current-state assertion in
   `tests/unit/deployment.test.ts`, and merge the reviewed change. Staging
   deploys automatically after green CI.
4. Verified: staging order 4 ($15.99 USDC) reached `ACTIVE` and revealed its
   credentials; the credential email was received at 12:45 UTC (13:45 local).
5. `production: true` and the D-024 guard were removed in the same reviewed
   change (D-032). Production `orders` was empty, so enabling its reconcile cron
   cannot dispatch a pre-existing order. Released 2026-11-02 through **Deploy
   production** (run 41512943722, Worker version `2b821f4f`).

A scheduled handler (`*/5 * * * *` in the generated configuration) reconciles
at most 25 orders per run: it re-dispatches the Workflow for old `PAID` orders
(only when enabled), re-syncs `PROVISIONING` orders with a linked service, and
marks an interrupted claim without one as `REVIEW_REQUIRED`. The schedule is
part of the reviewed deployment configuration, not a dashboard setting.

Checkout also verifies the live supplier balance before persisting an order and
adding a Zeno checkout. It requires the plan's supplier cost plus
`SUPPLIER_RESERVE_CENTS` (a Worker variable; set it to roughly one month of
renewals). A low balance returns 503 `insufficient_supplier_balance`; an
unreadable account fails closed with `supplier_balance_unavailable`. Both block
before any order or payment exists. The blocked path emits an
`operational_alert` (`checkout_blocked_supplier_balance`) with required/available
cents and no customer data. A supplier `402` during provisioning still marks that
order `FAILED`; the next checkout's live balance check is what pauses further
sales.

### Operational alerts

Alerting is built in, with no vendor. Every event is always a structured
`operational_alert` line in Workers Logs. Set the optional Worker secret
`ALERT_WEBHOOK_URL` to also deliver alerts to Slack, Discord, Telegram (add
`?chat_id=…`) or any JSON endpoint. Delivery is best-effort through
`ctx.waitUntil` with a three-second timeout and a per-code cooldown, so it never
blocks or fails a request. Covered events include supplier `401/403`, `402`,
`5xx`, provisioning `FAILED`/`REVIEW_REQUIRED`, webhook failures (including a
verified payment that matches no order), and a stale D1 backup. See
[Operational monitoring](MONITORING.md).

The backup freshness check reads `backup_heartbeat`; apply migration `0005`
before the next scheduled backup.

### Abuse protection

Checkout is limited to **5 requests per 60 seconds per client IP** by the
`CHECKOUT_RATE_LIMIT` binding; exhausted requests return 429 `rate_limited`.
Staging and production use separate limiter namespaces. The binding is
fail-open: an absent binding (Node dev) or a limiter error allows the request,
so a limiter outage does not take the shop down.

Turnstile is **config-gated and must be enabled before public sales**:

- Set the repository variable `TURNSTILE_SITE_KEY` to the public site key. The
  deploy workflows pass it into the generated Worker vars, and the storefront
  renders the widget only when it is non-empty.
- Set the Worker secret `TURNSTILE_SECRET_KEY` (dashboard or
  `wrangler secret put`) to the matching secret. Never paste it into source,
  chat, logs or a repository variable.
- With the secret present, checkout requires a valid token: missing →
  403 `turnstile_required`, invalid or unverifiable → 403 `turnstile_failed`.
  With no secret, the challenge is skipped — set both keys together.
- Provider and payment webhooks are never challenged with Turnstile or the
  checkout limiter; they verify signatures instead.

Setting `TURNSTILE_SITE_KEY` without the secret leaves the widget visible but
unverified, and setting only the secret makes checkout fail for every browser.

### Production checkout guard (removed)

Until 2026-11-02, `checkoutEnabled()` (server-side) forced checkout closed when
`DEPLOYMENT_TARGET=cloudflare-production`, regardless of `CHECKOUT_AVAILABLE`.
It existed because production holds Zeno keys: funding the supplier balance must
not silently open real payments while provisioning was disabled (D-024).
The guard was removed in the reviewed D-032 change after fulfilment was enabled
and one staging order had been verified end to end. `checkoutEnabled()` now
follows `CHECKOUT_AVAILABLE` in every environment; re-adding a target-specific
guard is a reviewed code change, not a configuration toggle.

## 4. Staging then production

Once explicitly enabled, staging reacts only to successful **push** CI runs on
this repository's main branch, and checks out that exact tested commit. It does
not accept pull-request artifacts or fork source into a privileged job.

Production is manual: run **Deploy production** on main and enter `DEPLOY`.
The workflow reruns CI, waits for production-environment approval, verifies
required reviewers, rebuilds the normal Worker, rejects unsafe bindings, checks
the remote migration ledger read-only and then deploys. Per-environment concurrency
prevents overlapping releases. Deploys use the reviewed per-environment
provisioning switches; no environment variable or ad-hoc deploy can change them.

Never use `tests/fixtures/wrangler.jsonc` for deployment. Generated approved
configuration selects `.open-next/worker.js`, never the fixture SQL endpoint.
Review the staging URL and logs before requesting production. A normal build
does not grant permission to provision servers or enable payments.

## 5. Rollback

Record the previous Worker version and schema before an approved release. Stop
new checkout/fulfilment writers before reverting application code. A Worker
rollback does not reverse database writes, provider orders or customer payments.
The additive reference migration retains historical fields, but the current
app requires the new columns; reconcile version/schema compatibility explicitly.

If payments were ever enabled after this cleanup, reconcile post-cutover records
before restoring an older system. Keep exactly one creation/renewal authority.
Test backups and restoration on disposable data before the first real cutover.

Scheduled D1 exports, R2 retention and the restore drill are documented in
[BACKUPS.md](./BACKUPS.md).

Sources:
[Cloudflare GitHub Actions documentation](https://developers.cloudflare.com/workers/ci-cd/external-cicd/github-actions/)
and [GitHub environment API permissions](https://docs.github.com/en/rest/deployments/environments#get-an-environment).
