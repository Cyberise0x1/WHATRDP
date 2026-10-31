# Architecture

## Application

A single Next.js 15 App Router application serves both UI and API. The Cloudflare build uses `custom-worker.ts` as the
Worker entry: it re-exports the generated OpenNext `fetch` handler and adds the
provisioning Workflow class. React
components live in `src/components`; provider, pricing, storage, encryption and
fulfilment logic live in `src/lib`. UI does not call the supplier API directly.
There is no separate Express server or second frontend service.

Ordinary Node builds/development use the isolated `node:sqlite` driver. OpenNext
builds replace that driver with the D1 binding using the Next webpack replacement
rule. A passing Next build alone is insufficient: tests run the final
Wrangler-packaged Worker, including its compatibility shims, in workerd.

## Persistence

`OrderRepository` exposes asynchronous storage operations shared by D1 and
SQLite. A conditional update claims payment only for matching reference,
amount, currency and pending status. A second conditional update records
provisioning intent before the billable supplier request.

The gateway-neutral payment seam is internal only. A Zeno adapter verifies the
Svix signature and authoritative settlement before constructing a confirmation.
`POST /api/checkout` is the only route that creates orders and calls a gateway:
it validates the request, writes the order (USD cost basis plus charged amount),
then asks Zeno for a hosted checkout and stores its reference. It fails closed —
before catalogue access, persistence or any gateway call — while
`CHECKOUT_AVAILABLE` is false in `src/lib/checkout-config.ts` (currently true on
staging, still closed on the released production build; D-018), and the webhook is
the only caller of the settlement seam. Checkout is USD-only; the charged-currency
columns stay so a legacy row can still never settle the wrong currency.

`migrations/0001_orders.sql` is the immutable historical baseline.
`0002_payment_reference.sql` adds a neutral reference and USD currency, copying
the old reference without dropping it. Old USD data retains its original
meaning. Historical SQL and the read-only backup compatibility exporter are the
only intentional legacy gateway-field exceptions.

Fresh Node databases use the current schema. Historical databases require an
approved forward migration; the driver does not perform one automatically.
Original local files remain where they were. The exporter reads an offline copy,
supports historical/current schemas and preserves IDs, tokens and ciphertext.

## Credentials and fulfilment

Server passwords retain the existing AES-256-GCM/scrypt format. Preserve
`APP_SECRET` when moving data; changing a session secret is unrelated.

Creation intent is durable before the upstream call. Lost responses and stale
claims cannot justify another creation request. Ambiguous outcomes require
review and fully paginated label reconciliation before linking a service.
Durable fulfilment runs in the `ProvisionWorkflow` Cloudflare Workflow exported
from `custom-worker.ts`: it claims the order, calls `POST /servers` once with
retries disabled, polls to `ACTIVE`, and stores encrypted credentials. The old
inline creation path is removed, so the Workflow is the only creation authority.
Order-status reads are read-only and never provision. A bounded cron (`*/5 * * * *`)
re-syncs stuck `PAID`/`PROVISIONING` orders, re-dispatches the Workflow for
`PAID` only while provisioning is enabled, and marks an interrupted claim with no
linked service for review. Label reconciliation walks every page, bounded at
10,000 servers rather than silently reading page one.

## Runtime boundaries

The supplier token and encryption key remain server-side. The provider callback
verifies HMAC and timestamp then fetches current status. Order responses are
private/no-store, and order pages use no-referrer/noindex headers.

Local emulator, staging and production databases must be separate. The checked-in
D1 ID is a local placeholder. Deployment preparation rejects placeholders,
environment-name mismatches and shared staging/production IDs; it always selects
the normal Worker entry point with provisioning disabled.

See [security](SECURITY.md) for known launch gaps.
