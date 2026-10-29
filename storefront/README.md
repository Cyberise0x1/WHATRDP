# Storefront — Next.js

Standalone white-label shop for rdp.monster inventory. Card checkout, automatic
provisioning, credentials delivered on the order page.

The WHMCS module in `../whmcs` is the other integration path; this one is for
when you want to own the storefront and the customer experience.

## Quick start

Install from the **repository root**, using its npm workspace lockfile:

```bash
npm ci
cp storefront/.env.example storefront/.env
npm run dev --workspace=storefront -- --hostname 0.0.0.0 --port 5000
```

Minimum required in `.env`:

```
RDP_MONSTER_API_TOKEN=rdpm_...
APP_SECRET=<32+ random chars>
```

The default is safe: missing Stripe configuration rejects checkout, and
`PROVISIONING_ENABLED=false` prevents supplier creation. A local-only development
payment bypass requires `ALLOW_DEV_CHECKOUT=true`; a real supplier call separately
requires `PROVISIONING_ENABLED=true` and explicit authorization to spend credit.
The bypass is rejected in production and Cloudflare staging even if accidentally
enabled. Do not enable either flag for routine UI testing.

## Cloudflare validation

The existing Next.js 15 path is retained, with an optional OpenNext build:

```bash
# Repository root; these commands do not publish.
npm run typecheck
npm run cf:build
npm test
npm run build

# Create schema in the new local emulator DB only, then run Workers preview.
cd storefront
CI=1 ../node_modules/.bin/wrangler d1 migrations apply DB --local
npm run cf:preview
```

The Cloudflare build replaces the Node-only database driver with a native D1
binding. Standard Node development keeps SQLite. The root npm lockfile manages
both; there is intentionally no independent lockfile in this workspace.

Tests package a **test-only** SQL fixture wrapper with Wrangler's `--dry-run`,
then run the packaged Next.js app and its real API handlers in workerd/Miniflare.
Supplier and payment HTTP requests are intercepted; tests never use real API keys
or create paid servers. The SQL fixture wrapper is **not** the normal Worker
entry point and must never be published.

The placeholder D1 ID is for local validation, not a deployed resource.
Local preview without configured provider bindings shows a catalogue-unavailable
message rather than fake stock. Cloudflare provisioning remains disabled even if
its feature flag is changed: queue/outbox activation requires separate work.

See `../docs/cloudflare-migration-validation.md` for evidence, costs, remaining
gaps, the WHMCS decision, secret transfer, cutover and rollback.

## How an order flows

```
browser                next server                     rdp.monster
   │  POST /api/checkout   │                                │
   │──────────────────────>│ create order (PENDING_PAYMENT) │
   │<──── stripe url ──────│                                │
   │  pays on Stripe       │                                │
   │                       │<── webhook: session.completed ──│
   │                       │ status PAID                    │
   │                       │ POST /servers ────────────────>│
   │                       │<── server id (INSTALLING) ─────│
   │  GET /order/<token>   │                                │
   │──────────────────────>│ GET /servers/:id ─────────────>│
   │                       │<── ACTIVE ────────────────────│
   │                       │ POST actions: credentials ────>│
   │<── ip/user/password ──│                                │
```

Two independent paths keep the order in sync: the page polls
`/api/orders/[token]`, and `/api/webhooks/rdpmonster` catches
`server.created` / `server.delivered` when the provider pushes.

## Files

```
src/app/page.tsx                  plan grid (server-rendered from /catalog)
src/app/order/[token]/page.tsx    order status page
src/components/PlansGrid.tsx      term/OS selectors + deploy buttons
src/components/OrderStatus.tsx    polling, credential reveal, copy buttons
src/app/api/checkout/route.ts     pricing check, order creation, Stripe session
src/app/api/orders/[token]/route.ts  status sync + credential fetch
src/app/api/webhooks/stripe/route.ts
src/app/api/webhooks/rdpmonster/route.ts
src/lib/rdpmonster.ts             API client: retries, 429, create dedupe
src/lib/catalog.ts                pricing wrapper around /catalog
src/lib/pricing.ts                markup, margin, cycle math
src/lib/store.ts                  async orders interface
src/lib/database.ts               Node-only SQLite driver
src/lib/database.cloudflare.ts    Cloudflare D1 binding
src/lib/orders.ts                 provision / sync / public view
src/lib/crypto.ts                 AES-256-GCM for credentials at rest
src/lib/signature.ts              HMAC verification for provider webhooks
```

## Pricing

`RETAIL_MULTIPLIER` (default `1.7`) is applied to the list price and rounded up
to the next `.99`. At Bronze (15% off), a Basic lists at $8.99, costs you
$7.64, and sells at $15.99 — about 52% gross margin.

Change the multiplier in `.env` to reprice the whole catalogue; nothing is
hardcoded.

## Security model

- The API token is only ever read on the server, never shipped to the browser.
- The order URL contains a 32-character random token; that token is the only
  credential needed to view an order, so treat the link as a secret.
- Server passwords are stored AES-256-GCM encrypted with `APP_SECRET`. Losing
  or rotating that key makes existing passwords unrecoverable.
- The rdp.monster webhook verifies `x-rdpm-signature` and rejects anything with
  a timestamp more than 5 minutes old.

## Before production

1. **Approve and complete the persistence cutover.** D1 has been validated with
   disposable fixtures only; no existing database has been imported or replaced.
2. **Set `ALLOW_DEV_CHECKOUT=false`** and add real Stripe keys plus the webhook
   secret from the Stripe dashboard.
3. **Point the provider webhook** at `https://yourdomain/api/webhooks/rdpmonster`
   and set `RDPM_WEBHOOK_SECRET`.
4. **Implement the queue/outbox and reconciliation design.** An order with an
   interrupted creation claim or uncertain supplier outcome requires review,
   never a blind retry. Payment claims and provisioning claims are atomic.
5. **Fund the reseller balance.** A `402` pauses sales until you top up; the
   order records why it failed so support can see it.
6. **Add support and legal pages** — terms, refund policy, AUP. You are the
   merchant of record.

## Requirements

Node 22+ for development/builds and the local SQLite path; the Cloudflare path
uses Workers plus D1. Both need outbound HTTPS to `dashboard.rdp.monster`.
