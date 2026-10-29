# GitHub and Cloudflare deployment

## Status and prerequisites

Workflow definitions are prepared, **disabled by default**, and have not been
run on GitHub or deployed to Cloudflare. The checked-in D1 ID is local-only.
No GitHub repo push, cloud resource creation, DNS change, secret transfer, live
payment or supplier purchase is part of repository cleanup.

The owner must separately approve repository connection, staging resources,
least-privilege credentials and any publishing. Checkout remains disabled even
after a release; hosting setup is not launch readiness.

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

| Variable                        | Meaning                                                           |
| ------------------------------- | ----------------------------------------------------------------- |
| `STAGING_WORKER_NAME`           | Approved Worker name ending `-staging`                            |
| `STAGING_D1_DATABASE_NAME`      | Approved database name ending `-staging`                          |
| `STAGING_D1_DATABASE_ID`        | Actual staging UUID, never the local placeholder                  |
| `PRODUCTION_WORKER_NAME`        | Approved Worker name ending `-production`                         |
| `PRODUCTION_D1_DATABASE_NAME`   | Approved database name ending `-production`                       |
| `PRODUCTION_D1_DATABASE_ID`     | Different actual production UUID                                  |
| `ENABLE_STAGING_DEPLOYMENTS`    | Leave absent/false until staging releases are approved            |
| `ENABLE_PRODUCTION_DEPLOYMENTS` | Leave absent/false until production policy/resources are approved |

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
