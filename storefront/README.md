# Storefront — Next.js

Standalone white-label shop for rdp.monster inventory. Card checkout, automatic
provisioning, credentials delivered on the order page.

The WHMCS module in `../whmcs` is the other integration path; this one is for
when you want to own the storefront and the customer experience.

## Quick start

```bash
cp .env.example .env
npm install
npm run dev
```

Minimum required in `.env`:

```
RDP_MONSTER_API_TOKEN=rdpm_...
APP_SECRET=<32+ random chars>
```

With no `STRIPE_SECRET_KEY` and `ALLOW_DEV_CHECKOUT=true`, checkout skips
payment and immediately runs the provisioning flow — useful for testing the
whole chain against a real account. **Never leave dev checkout on in
production.**

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
src/lib/store.ts                  SQLite orders table
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

1. **Move storage off SQLite.** `src/lib/store.ts` is a small interface; swap it
   for Postgres or MySQL when you deploy more than one instance. `node:sqlite`
   is single-node and file-local.
2. **Set `ALLOW_DEV_CHECKOUT=false`** and add real Stripe keys plus the webhook
   secret from the Stripe dashboard.
3. **Point the provider webhook** at `https://yourdomain/api/webhooks/rdpmonster`
   and set `RDPM_WEBHOOK_SECRET`.
4. **Add a reconciliation job.** Any order stuck in `PAID` or `PROVISIONING` for
   more than 10 minutes should be re-synced; `POST /servers` failures are
   deliberately not retried automatically.
5. **Fund the reseller balance.** A `402` pauses sales until you top up; the
   order records why it failed so support can see it.
6. **Add support and legal pages** — terms, refund policy, AUP. You are the
   merchant of record.

## Requirements

Node 22+ (uses `node:sqlite`), and outbound HTTPS to
`dashboard.rdp.monster`.
