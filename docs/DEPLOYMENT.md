# GitHub and Cloudflare deployment

## Status and prerequisites

**Live resources (updated 2026-10-30).** Both environments are released.
Production serves `https://whatrdp.com` from Worker `whatrdp-production` with D1
`whatrdp-production` (migrations 0001–0004 verified remotely); the public
`*.workers.dev` route is disabled and the custom domain holds the TLS
certificate. Staging serves
`https://whatrdp-staging.cyberise2020.workers.dev`. Worker secrets
`APP_SECRET` and `RDP_MONSTER_API_TOKEN` are set on both through the dashboard.
The storefront renders and `/api/catalog` returns 200. Staging runs with
checkout enabled (D-018) and the `ZENO_API_KEY` secret, pending one verified
payment; the released production build still answers 503
`payments_not_configured`, so no public sales are possible. Fulfilment remains
disabled in both environments.

Production was released through `Deploy production` at `c6e4784` after the
environment gate (required reviewer, `PRODUCTION_POLICY_READ_TOKEN`, typed
`DEPLOY`). `www.whatrdp.com` has **no** DNS record and does not resolve — only the
apex is attached. The checked-in D1 ID is local-only; real IDs live in repository
variables.

Both workflows are enabled and have run; production was released manually through
the gated workflow.

The owner must separately approve repository connection, staging resources,
least-privilege credentials and any publishing. Checkout remains disabled even
after a release; hosting setup is not launch readiness.

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
`PROVISION_WORKFLOW`). Deploys keep `PROVISIONING_ENABLED=false`, so a settled
order stays `PAID` and no Workflow is dispatched. Enabling fulfilment requires
a reviewed code change to `scripts/lib/deployment.ts` and its tests, followed
by a funded staging verification. Do not enable it by adding an environment
variable.

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
before any order or payment exists. The blocked path logs
`checkout_blocked_supplier_balance` with required/available cents and no customer
data — route that log to the monitoring/alerting work (P2-1). A supplier `402`
during provisioning still marks that order `FAILED`; the next checkout's live
balance check is what pauses further sales.

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

### Production stays closed

`checkoutEnabled()` (server-side) keeps checkout closed when
`DEPLOYMENT_TARGET=cloudflare-production`, regardless of `CHECKOUT_AVAILABLE`.
Staging remains open for controlled testing. This exists because production
holds Zeno keys: funding the supplier balance must not silently open real
payments while provisioning is disabled. Removing the guard is a reviewed code
change, made only after fulfilment is enabled and one supplier order has been
verified end to end. It is not a configuration toggle.

## 4. Staging then production

Once explicitly enabled, staging reacts only to successful **push** CI runs on
this repository's main branch, and checks out that exact tested commit. It does
not accept pull-request artifacts or fork source into a privileged job.

Production is manual: run **Deploy production** on main and enter `DEPLOY`.
The workflow reruns CI, waits for production-environment approval, verifies
required reviewers, rebuilds the normal Worker, rejects unsafe bindings, checks
the remote migration ledger read-only and then deploys. Per-environment concurrency
prevents overlapping releases. Deploys always keep provisioning disabled.

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

Sources:
[Cloudflare GitHub Actions documentation](https://developers.cloudflare.com/workers/ci-cd/external-cicd/github-actions/)
and [GitHub environment API permissions](https://docs.github.com/en/rest/deployments/environments#get-an-environment).
