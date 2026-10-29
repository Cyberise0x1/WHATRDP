# Cloudflare migration validation

**Date:** 2026-10-29  
**Scope:** Local staging compatibility, disposable database fixtures and migration planning. No publishing, DNS changes, merchant setup, real-data import or paid server orders.

## Decision

Use **OpenNext for the existing Next.js 15 application** as the validated staging path. Retain the normal Node development/build path and leave legacy WHMCS reference files untouched.

**Coordination update:** the shared project decisions now specify an in-house app, no WHMCS, and crypto-only Zeno Bank payments. This validation began against the existing Stripe implementation; it verifies that baseline, not a launch decision to use Stripe. Zeno implementation is queued separately and was not added here.

Cloudflare's current general Next.js guide recommends vinext, but calls it beta and describes existing-app migration from Next.js 16. Changing the framework or upgrading a major version was unnecessary for this compatibility check. OpenNext is still documented; the installed adapter supports this app's App Router, server rendering and route handlers. This is a project-specific compatibility decision, not a claim that OpenNext is Cloudflare's preferred default.

Validated versions: Next.js 15.5.28, OpenNext Cloudflare 1.20.14, Wrangler 4.155.0, Miniflare/workerd 2026-07-30. Runtime compatibility is pinned to 2026-07-01, a date supported by the installed runtime. Raise it only with a fresh runtime test; a newer documentation example is not proof the installed emulator implements a newer date.

## What changed and was tested

- An asynchronous order repository works with native D1 SQL semantics and the existing Node/SQLite path.
- The Cloudflare build replaces the Node-only SQLite driver; the final Cloudflare server bundle contains no `node:sqlite` import. Ordinary Node development still uses SQLite.
- D1 migration SQL preserves the existing order fields, IDs, tokens, timestamps and encrypted password format.
- Payment acceptance requires a signed notification followed by authoritative session retrieval, matching session binding, completed/paid status, USD amount and order metadata.
- Atomic conditional updates permit one payment claim and one provisioning claim, even under concurrent duplicate delivery.
- A supplier creation claim is persisted before calling the billable API. Interrupted or ambiguous outcomes cannot auto-create again; uncertain outcomes become `REVIEW_REQUIRED`.
- Mutating API calls are not retried. Read retries are bounded, and upstream requests have a timeout.
- Provider callbacks verify HMAC and the timestamp window. Service callbacks fetch authoritative provider state rather than trusting event-supplied IP/status.
- Credential ciphertext written by Node is decryptable inside Workers, and ciphertext written by Workers is decryptable by Node, using the same `APP_SECRET`.
- Order API responses are private/no-store, and order pages carry no-referrer/noindex headers.
- Development checkout cannot bypass payment on Cloudflare or in production.

The test harness packages the final Worker with Wrangler **dry-run only**, then runs the app in local workerd/Miniflare with a disposable D1 database. All supplier and Stripe HTTP calls are intercepted and unexpected egress fails. It exercises actual Next.js server rendering and API routes, not approximations of their handlers.

The test-only SQL fixture endpoint is never part of the normal Worker entry point. Do not publish the test configuration or fixture bundle.

### Reproducible checks

The type check, both builds and **15 tests passed**. The separate local D1 migration applied successfully, and the Wrangler preview served the landing page and static assets. A screenshot confirmed the page renders; the unconfigured preview deliberately shows “Catalogue unavailable” because no supplier secret has been transferred into Worker bindings.

Run from the repository root:

```text
npm ci
npm run typecheck
npm run cf:build
npm test
npm run build
```

`npm test` requires an existing Cloudflare build. Its Wrangler command uses `--dry-run`, which packages locally and does not upload or deploy.

The suite covers server-rendered catalogue/API, checkout input validation/session persistence, mismatched and unpaid payments, invalid Stripe signatures, duplicate payment/provisioning claims, interrupted and uncertain creation, provider signature tampering/stale timestamps, authoritative service sync, credential compatibility, no-store responses, unknown order links, an offline SQLite-to-D1 fixture round-trip, and production checkout rejection without a payment key. Separate tests cover the Node/SQLite fallback and bounded safe API retries.

### Not established

- No deployed Cloudflare URL, real account resource, live network route or external CI installation was tested.
- No real Stripe merchant connection, NGN payment flow, supplier purchase or production secret was used.
- The tests validate runtime compatibility and selected safety properties, not a full security audit or load benchmark.
- Account authentication and authorization are not implemented by this migration. Order links remain bearer credentials.
- Queues and scheduled reconciliation are designed below, but not activated.
- The local placeholder D1 ID must not be mistaken for an existing remote database.

## Resource and operating-cost plan

| Resource | Need |
|---|---|
| Workers and static assets | Next.js site and API |
| D1 | Persistent orders/payment bindings; create an approved staging DB before any remote trial |
| Workflows / optional Queues | Durable fulfilment and outbox delivery; shared launch plan favors Workflows; not yet activated |
| Cron Triggers | Reconciliation and outbox repair; UTC schedules |
| R2 | Optional private exports/invoices; not required by the current dynamic routes |
| Worker secrets | Supplier token, encryption key, gateway and webhook secrets |
| Custom domain/TLS | Configure only after a separately approved cutover |

Workers Paid currently has a **$5/month minimum** with included usage, not a guaranteed $5 total. The pricing page lists 10 million requests and 30 million CPU-ms per month, D1 allowances of 25 billion rows read, 50 million rows written and 5 GB storage, and 1 million Queue operations per month. A delivered queue message commonly consumes three operations before retries. R2 has separate storage/operation allowances and charges.

Low-volume use may fit those allowances, but this was not load-tested. Workflows usage must also be included in the final account estimate. Server-rendering and credential key derivation consume CPU, so do not assume the Free plan's 10ms CPU allowance is sufficient. Monitor requests, CPU, rows scanned/written, storage, queue retries and failure counts; use indexes, request limits and alerts. Keep domains, tax, email, gateway/FX fees and RDP.monster credit/renewal reserves separate from Cloudflare hosting costs.

## Reliable background-work design

This is an explicit activation plan, **not a deployed scheduler/consumer**:

The shared launch plan prefers Cloudflare Workflows. The delivery/outbox design below can use Queues plus Cron or be adapted to Workflows. **Disable automatic step retries around billable creation**; workflow durability does not make an upstream `POST /servers` idempotent. The D1 claim must precede the request in either implementation.

1. Treat a verified `PAID` order with no service ID as a durable outbox record. Commit payment first, then enqueue only its order ID. A periodic scan repairs the gap if payment commits but queue sending fails.
2. Treat Queues as at-least-once. Each delivery reloads the order and atomically claims it before `POST /servers`; duplicates do not win another claim. Start with consumer concurrency one.
3. Persist creation intent before the supplier request. If the process stops after a claim or the response is lost, stop automatic creation. Search all supplier pages for the unique token-based label and match plan/OS/cycle before linking an existing service. Absence from one page, or a recent response, is not proof no server was created.
4. Put uncertain or stale unlinked claims into a review queue with an operator alert. Never reissue creation merely because a lease or queue timeout elapsed. Repeated failures need a dead-letter queue and a documented support procedure.
5. Once a service ID is recorded, poll status with bounded read jobs, not a long request sleeping indefinitely. Stop on active, failed, expired or cancelled status. Do not treat a read failure as evidence the VM is absent.
6. Run reconciliation every five minutes in UTC, with bounded batches and persisted progress. Reconcile paid/outbox gaps, stale creation, service status, provider credit and pending failures. Renewal checks must not silently place renewal orders.
7. Establish a **shared** token request budget below the documented 120 requests/minute, for example 60/minute initially. Include catalogue requests, webhooks, customer polling and retries in that budget; handle `Retry-After` and back off rather than spin. Cache non-sensitive catalogue data and avoid every browser independently polling the supplier.
8. Verify payment amount/currency/ownership before the outbox entry exists. Use a durable event ledger and operator visibility for webhook failures; duplicate deliveries must remain harmless.

The current Cloudflare path intentionally refuses inline paid provisioning even if its feature flag is changed. Implement and test this background path before enabling public paid checkout. The Node path also defaults to provisioning disabled.

## Safe database migration

No existing database was opened, imported, deleted or replaced during validation. Tests use new SQLite files under temporary directories and isolated emulator D1 data.

The export helper opens an explicitly supplied offline SQLite copy read-only. It writes SQL only under ignored `generated-artifacts/`, with exclusive creation and mode 0600; it does not overwrite an existing export or import anything. The fixture test verifies unchanged source bytes, preserved ciphertext/IDs/tokens, successful import and a subsequent increasing ID.

After explicit approval:

1. Inventory the real source database and the encryption key that protects its records. Keep `APP_SECRET` unchanged; the session secret is not a substitute.
2. Disable new checkout and pause both old/new provisioning writers and renewal authority. Quiesce callbacks/jobs for a consistent cutover.
3. Make a consistent SQLite backup/offline copy, including any WAL state. Do not copy only a live `.db` file while ignoring its WAL.
4. From the repository root, export that copy:

   `npm run orders:export -- --offline-copy /approved/offline-copy.db generated-artifacts/orders.sql`

5. Create an approved **new** remote D1 database, apply the schema, then import the private export using reviewed provider commands. Do not point at an existing database by guess or run remote migration commands during this validation task.
6. Compare row counts, IDs, token/session uniqueness, status totals, timestamps and sampled decryption in a restricted test. Check pending/uncertain orders against the supplier before enabling any creation.
7. Keep the source backup read-only and protect exports as customer data. They contain bearer order tokens and encrypted server credentials; never commit them, put them in public R2 or include them in the deployment.

## Secret-transfer checklist

Replit Secrets do not automatically become Worker secrets. Transfer only through the provider's protected secret interface after approval; do not paste values into chat, source, configuration vars, build logs or shell command arguments.

| Runtime name | Action |
|---|---|
| `RDP_MONSTER_API_TOKEN` | Map the approved API key currently named `RDP_MONSTER_API_KEY` to this runtime name; verify permissions, expiry and any IP restrictions |
| `APP_SECRET` | Preserve the original key for existing ciphertext; generate a new one only for a truly new dataset with no encrypted records to preserve |
| `STRIPE_SECRET_KEY` | Legacy baseline only; do not configure live Stripe keys for the crypto-only launch |
| `STRIPE_WEBHOOK_SECRET` | Legacy test endpoint signing secret, not a Zeno credential |
| `RDPM_WEBHOOK_SECRET` | Provider endpoint signing secret; distinct from the reseller API key |

Do not transfer the supplier login email/password; the API integration does not need them. Do not substitute `SESSION_SECRET` for `APP_SECRET`. Zeno API and webhook credentials must be mapped to the bindings defined by its separate implementation, not placed in Stripe fields. Bind D1 to `DB`; configure the public base URL and non-sensitive pricing separately. Keep test/prod databases, secrets and callbacks separated. Verify Cloudflare egress is compatible with any supplier token IP allowlist; it was not tested here.

## WHMCS and billing boundary

Workers/Pages do not directly run WHMCS's PHP/ionCube/MySQL application. Cloudflare Containers can provide Linux runtimes, so it would be inaccurate to say WHMCS is impossible on every Cloudflare product; however, no supported complete WHMCS container/database/licence/automation solution was validated.

The technical alternatives are:

- **Custom Cloudflare app:** keep the existing storefront, but finish customer accounts, admin/support workflows, invoices/tax records, renewal authority, refunds/disputes, audit trails and privacy/abuse controls. This is more work than merely changing hosting.
- **Keep WHMCS:** retain a separately supported WHMCS environment; Cloudflare can host/protect the frontend, but that is not an entirely Workers-hosted backend.

The current shared project decision selects the custom application with **no WHMCS**. No WHMCS files were removed; they remain reference only. This validation does not reverse that decision.

NGN and USD remain the requested checkout currencies. The current baseline route charges USD only through legacy Stripe code; that code is not a Zeno integration. Zeno checkout, signed/deduplicated callbacks, charged-currency/amount persistence, wallet delivery, FX pricing/expiry, partial-payment handling, fees and NGN support require separate implementation and validation. Do not advertise NGN checkout as working.

## Approval-gated cutover and rollback

Before cutover, complete the selected custom/Zeno billing path, background jobs and access controls, verify supplier policies/credit and perform an approved controlled transaction. Establish alerts and a tested backup restore. Real API connectivity, signed provider callbacks and payment settlement remain external checks. The landing page's ten-second delivery claim was not established by local tests and must be reviewed before launch.

For cutover, take the source snapshot, validate the new D1 data, configure secrets and callback URLs, and switch only when the user approves. Exactly **one** system may create or renew supplier services. A DNS rollback alone does not undo supplier orders or gateway charges.

For rollback, stop new Cloudflare checkout and consumers first, reconcile any in-flight payments and upstream services, then export/reconcile post-cutover records into the original system before restoring its writers. Never turn on the old database blindly after new payments have been accepted. Keep the previous app build and offline database backup until the cutover is accepted.

## Sources

- https://developers.cloudflare.com/workers/framework-guides/web-apps/nextjs/
- https://developers.cloudflare.com/workers/framework-guides/web-apps/opennext/
- https://opennext.js.org/cloudflare/get-started
- https://developers.cloudflare.com/workers/runtime-apis/nodejs/fs/
- https://developers.cloudflare.com/d1/
- https://developers.cloudflare.com/queues/reference/delivery-guarantees/
- https://developers.cloudflare.com/workers/configuration/cron-triggers/
- https://developers.cloudflare.com/workers/platform/pricing/
- https://docs.whmcs.com/9-1/installation-guide/system-requirements/
- https://developers.cloudflare.com/containers/
