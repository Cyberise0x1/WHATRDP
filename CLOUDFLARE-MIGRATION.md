# Moving the storefront and backend to Cloudflare

Evaluation record, 2026-10-29. Checked against the live Cloudflare docs, not
the tweet that prompted it.

**Trigger:** `@ibothinks` — "cloudflare feels easy to recommend: workers:
frontend + backend · d1: database · r2: storage · durable objects: realtime ·
workflows: background jobs".

**Verdict:** that thesis holds for *our application*. It does not hold for our
*product*. Cloudflare can host 100% of the shop and API, and 0% of the Windows
servers we resell. Those two facts are compatible — the servers already live at
rdp.monster, so "everything on Cloudflare" means the business app moves and the
inventory stays where it is.

The one casualty was going to be **WHMCS**. It cannot run on Cloudflare at all —
but we are not using it anyway. Everything is custom, so there is nothing to
port and nothing to lose. The Next.js storefront is the only storefront by
design.

Payments are crypto-only for now (Zeno Bank), so there is no Stripe, no
merchant-account verification, and no chargeback exposure in the launch path.

> **State of the code (2026-10-29):** a Workers/D1 port is already in flight in
> the working tree — `SqlDatabase` abstraction, `OrderRepository` with atomic
> `claimPayment`/`claimProvision`, `database.cloudflare.ts`, OpenNext config,
> `wrangler.jsonc`, `migrations/0001_orders.sql`. It is still wired to Stripe.
> The Zeno swap lands on top of `src/lib/payments.ts`; do not rewrite the
> repository layer.

---

## 1. What Cloudflare can and cannot host

| Our component | Moves to Cloudflare? | Target |
| --- | --- | --- |
| Next.js storefront (SSR + UI) | Yes | Workers |
| API route handlers | Yes | Workers |
| Order database (SQLite today) | Yes, rewritten | D1 |
| Credential encryption (`node:crypto`) | Yes, unchanged | Workers `node:crypto` |
| Zeno Bank crypto checkout + webhooks | Yes | Workers + hosted checkout |
| rdp.monster webhooks | Yes | Workers |
| Provisioning / polling | Yes, better | Workflows |
| Reconciliation job | Yes | Cron Trigger + Workflow |
| Backups / exports | Yes | R2 |
| Transactional email | Yes, beta | Email Service (sending) |
| DNS, TLS, WAF, rate limits, bot defence | Yes | Cloudflare zone + Turnstile |
| **WHMCS (PHP + ionCube + MySQL)** | **No** | — |
| **Windows RDP servers we sell** | **No** | stays at rdp.monster |

### Why WHMCS cannot come along

WHMCS 9 is ionCube-encoded PHP requiring PHP 8.2–8.4, the ionCube Loader 15
native extension, MySQL and Apache `mod_rewrite`. Workers run V8 isolates, not
PHP. Community PHP-on-WASM projects exist, but an encoded ionCube binary cannot
load without the native loader, so this is a hard stop, not a porting job.
Keep `whmcs/` in the repo as the fallback path if you ever rent PHP hosting.

### Why the RDP servers cannot come along

Three independent blockers, any one of which is fatal:

1. **Containers are Linux only.** The runtime is a Firecracker microVM running
   a `linux/amd64` container. There is no Windows image, and no way to supply
   one.
2. **Containers are far too small and disposable.** Max custom instance is
   4 vCPU / 12 GiB RAM / 20 GB disk, disk is ephemeral (fresh image on every
   start), and instances stop on an inactivity timeout. Our cheapest SKU is
   2c/6GB, our largest is 24c/64GB/200GB. Even the smallest plan would sleep and
   lose state.
3. **No inbound TCP/UDP from end users.** Cloudflare states: "Because all
   Container requests are passed through a Worker, end-users cannot make
   non-HTTP TCP or UDP requests to a Container instance." RDP is inbound TCP
   3389.

Spectrum (L4 proxy) can carry TCP/UDP, but **custom TCP/UDP requires an
Enterprise plan plus a paid Spectrum add-on**, and it only proxies to an origin
that already exists — it is not a place to run servers. Cloudflare Tunnel +
Access can publish RDP *over the browser* for machines you control with
`cloudflared` installed; we do not control the rdp.monster hosts, and that is an
access product, not hosting.

So the architecture is unchanged at the bottom:

```
customer ──HTTPS──> Cloudflare (Workers + D1 + R2)  ──HTTPS──> dashboard.rdp.monster
                                                              │
customer ──RDP 3389──────────────────────────────────────────>│ Windows VM (theirs)
```

The customer still connects straight to the provider's IP. We never proxy 3389.

---

## 2. Target architecture

```
                    ┌─────────────────────────────────────────┐
  browser ─────────>│ Worker: Next.js (OpenNext or vinext)    │
                    │  /                catalogue (SSR)        │
                    │  /api/checkout    Zeno checkout session  │
                    │  /api/orders/:t   poll + reveal creds    │
                    │  /api/webhooks/*  Zeno + rdp.monster     │
                    └───────┬──────────────┬──────────────────┘
                            │              │
                    D1 (orders)      Workflow (provision)
                            │              │
                            │        POST /servers ──> rdp.monster
                            │        poll GET /servers/:id
                            │              │
                       R2 (backups)   Email Service (creds)
                            ▲
              Cron Trigger ─┘ reconcile stuck orders every 5 min
```

## 3. Service mapping and cost

| Service | Use | Plan note |
| --- | --- | --- |
| Workers Paid | app, API, webhooks | **$5/mo floor**, 10M req + 30M CPU-ms included |
| D1 | orders | 25B rows read / 50M written / 5 GB included |
| Workflows | provisioning, credential delivery | 500k steps included |
| Cron Triggers | reconciliation | 250 per account |
| R2 | DB exports, invoices | 10 GB free, **no egress fees** |
| Email Service | credentials, receipts | sending is beta, Workers Paid |
| Turnstile + WAF | checkout abuse, card testing | free |
| Registrar / DNS | domain, SPF/DKIM/DMARC | at-cost registration |

Realistic bill at our volume: **$5–6/month**, versus $9.95 for SkyNetHosting,
$43.95 for PeekHosting + WHMCS, or ~$41–50 for a VPS + WHMCS. This is the
single biggest reason to do it.

Payment processing is also cheaper than the card rails the old plan assumed:
Zeno charges **0.1%** (0.35% on Lightning, 0% on Binance Pay) against roughly
2.9% + $0.30 for Stripe. On a $15.99 order that is $0.016 instead of $0.76.
Watch the fixed costs instead: **$1 + network fee per withdrawal** in managed
mode, and network fees on every sweep.

Workers Free is not viable: 10 ms CPU per request will not run Next.js SSR.

---

## 4. Code changes required in `storefront/`

Nothing here is speculative — this is what the current files need.

| File | Change |
| --- | --- |
| `src/lib/store.ts` | **Already ported (in flight).** Now a thin async facade over `OrderRepository` + `SqlDatabase`. `database.ts` is the Node/SQLite driver; `database.cloudflare.ts` is the D1 driver, selected by a build-time alias in `next.config.ts`. |
| `src/lib/crypto.ts` | **No change.** `node:crypto` is fully supported in Workers (only argon2, ed448/x448 and DSA/DH keygen are excluded). `scryptSync` + AES-256-GCM works. |
| `src/lib/signature.ts` | **No change.** `createHmac` + `timingSafeEqual` are supported. |
| `src/lib/payments.ts` | **Swap the provider here.** `acceptCheckoutPayment()` is the seam; it currently validates a Stripe session. Replace with Zeno's `orderId`/`paidAmount` check and keep the `claimPayment` call. |
| `src/lib/stripe.ts` | **Delete once payments.ts is swapped.** Replaced by `src/lib/zenobank.ts` (plain `fetch`, no SDK required). |
| `src/app/api/webhooks/stripe/route.ts` | **Delete.** Replaced by `/api/webhooks/zenobank`. |
| `src/app/api/webhooks/zenobank/route.ts` | **New.** Svix-style HMAC verification via WebCrypto; idempotent on `svix-id`. |
| `src/lib/storage/repository.ts` | Add `checkout_ref` (generalise `stripe_session`), `charge_currency`, `charge_amount_minor`, `fx_rate`, `markExpired()`, `markPartial()`, and a `webhook_events(svix_id UNIQUE)` table. Keep `claimPayment`/`claimProvision` semantics. |
| `storefront/migrations/` | Add `0002_zenobank.sql`: rename/add `checkout_ref`, add `EXPIRED`/`PARTIAL` statuses support, add `webhook_events`. |
| `storefront/wrangler.jsonc` | Replace the placeholder `database_id` with the real D1 id; `PROVISIONING_ENABLED` stays `false` until go-live. |
| `src/lib/orders.ts` | Keep, but drive `provisionOrder` from a Workflow instead of inline in the webhook. |
| `next.config.ts` | Add OpenNext/vinext config; drop the SQLite-era assumptions. |
| `.env` | Becomes `wrangler secret put` for `RDP_MONSTER_API_TOKEN`, `APP_SECRET`, `ZENO_API_KEY`, `ZENO_WEBHOOK_SECRET`, `RDPM_WEBHOOK_SECRET`. Public values become `vars`. |
| `README.md` | Replace "Node 22+ (uses node:sqlite)" — that is no longer true. |

Two deployment paths, both documented by Cloudflare:

- **OpenNext adapter** (`@opennextjs/cloudflare`) — the documented path for an
  existing Next 15 app. Lowest-risk option for this codebase.
- **vinext** — Cloudflare's new recommended default, but it is **beta** and
  targets Next 16. Run `npx vinext check` before committing to it.

Recommendation: ship on OpenNext now, re-evaluate vinext once it leaves beta.

### Provisioning belongs in a Workflow

The current flow does `POST /servers` inside the payment webhook and lets the
order page poll. On Cloudflare, move it out of the request path:

- `step.do("create", { retries: { limit: 0 } })` — **zero retries on the create
  step**. Workflows retry steps by default, and a retried `POST /servers`
  double-provisions and double-bills. The existing `claimProvision()` write
  (`PAID` → `PROVISIONING`, persisted *before* the billable call) and the
  `web-<token>` label are the safety net; on an uncertain outcome the order goes
  to `REVIEW_REQUIRED`, never back to a retry.
- `step.sleep("wait", "5 seconds")` + poll until `ACTIVE`, then fetch
  credentials and store them encrypted.
- `step.do("email")` to send credentials.
- If the account returns `402`, end the workflow and leave the order `FAILED` —
  it resumes when you top up.

Order-page polling can stay; it is a cheap read path.

### Local limits that matter

- 6 simultaneous outbound connections per request. One provider call + one D1
  query is fine; do not fan out catalogue fetches.
- 128 MB per isolate, 5 min CPU max (30 s default), unlimited wall time for an
  HTTP request. Our handlers are nowhere near these.
- D1 is **single-threaded per database** and capped at 10 GB. Our orders table
  is tiny; this is a non-issue until we are doing thousands of orders per
  minute.
- 1,000 D1 queries per Worker invocation, 30 s per query, 2 MB per row. Fine.

---

## 5. Payment rail: Zeno Bank (crypto only)

No Stripe, no PayPal, no card data, no merchant-account verification. Zeno
hosts the payment page; we redirect and react to webhooks.

### Order flow

```
POST /api/checkout ──> validate plan/os/cycle, price in USD cents
                   ──> INSERT order (PENDING_PAYMENT)
                   ──> POST api.zenobank.io/api/v1/checkouts
                       { orderId, priceAmount: "15.99", priceCurrency: "USD",
                         successRedirectUrl }
                   <── { id: "ch_…", checkoutUrl: "https://pay.zenobank.io/ch_…" }
                   ──> store checkout id, return checkoutUrl
browser ──redirect──> pay.zenobank.io/ch_…  (customer pays any enabled token)
Zeno ──webhook──> /api/webhooks/zenobank   (checkout.completed)
                   ──> verify Svix signature, dedupe svix-id
                   ──> order PAID, start provisioning Workflow
order page ──poll──> /api/orders/:token
                   ──> fallback: GET api.zenobank.io/api/v1/public/checkouts/{id}
```

### API contract

- `POST https://api.zenobank.io/api/v1/checkouts`, header `X-API-Key: sk_…`.
- Body: `orderId` (string), `priceAmount` (decimal **string**), `priceCurrency`
  (`"USD"` or `"NGN"` — both supported), optional `successRedirectUrl`.
- **Two currencies are required.** Nigerian customers see NGN, everyone else
  USD. That means the order must persist the **charged** currency and amount
  plus the FX rate used, and `claimPayment` must compare against the charged
  amount — not against the USD cost basis in `amount_cents`. Cache the FX rate
  in KV with a short TTL and a small buffer; never re-quote after the checkout
  is created.
- Response: `id` (`ch_…`), `status` (`OPEN`), `expiresAt`, `checkoutUrl`.
- `GET https://api.zenobank.io/api/v1/public/checkouts/{id}` is **public, no
  auth** — use it for polling and webhook-late reconciliation. Never leak the
  `sk_` key to the browser.
- Fees: 0.1% (0.35% Lightning, 0% Binance Pay). Withdrawal $1 + network fees in
  managed mode; none in BYO mode.
- Supported: USDT, USDC, PYUSD, ETH, BNB, POL, SOL, BTC, LTC, plus Lightning and
  Binance Pay. Multi-token payment is allowed; wrong-network sends are detected.

### Webhook verification (Workers-native)

Zeno uses Svix/Standard Webhooks. Implement it directly — no SDK needed:

- Signed content: `` `${svix-id}.${svix-timestamp}.${rawBody}` ``
- Key: base64-decode the `whsec_…` secret (strip the prefix)
- Header `svix-signature` is `v1,<base64-hmac>`; compare in constant time
- Reject if `|now - svix-timestamp| > 300` seconds
- Use WebCrypto (`crypto.subtle.importKey` + `sign`); `node:crypto` works too
- Read the **raw body** with `await request.text()` before `JSON.parse`

### Event handling

| Event | Order state | Action |
| --- | --- | --- |
| `checkout.completed` | `PAID` | `claimPayment()` conditional UPDATE, then start the provisioning Workflow. A duplicate cannot win twice. |
| `checkout.expired` | `EXPIRED` | Never provision. Allow a fresh checkout on the same order. |
| `checkout.partially_paid` | `PARTIAL` | Funds already swept to your balance. Never auto-provision; offer top-up or manual refund. |

Delivery is **at-least-once** with retries over ~17 hours. Insert `svix-id`
into a `webhook_events` table with a unique index; on conflict return `200` and
do nothing. Acknowledge with `2xx` immediately and do the slow work in a
Workflow — retries stop only on `2xx`.

Two idempotency layers, deliberately: `webhook_events` drops duplicate
deliveries before any work, and `claimPayment()`'s conditional
`UPDATE … WHERE status = 'PENDING_PAYMENT'` means even a second *distinct* event
for the same order cannot re-trigger provisioning.

### Settlement loop

Customer crypto does not become rdp.monster balance by itself.

**Decided: bring-your-own wallet.** Funds sweep directly to your wallet; send
them to rdp.monster's top-up address. No withdrawal fee, no 24 h hold, no
custody with Zeno.

(Managed mode remains a dashboard switch if custody ever becomes preferable:
funds would sit in your Zeno balance and each withdrawal costs $1 + network
fees and can take up to 24 h.)

rdp.monster exposes `billing:read` only, so the top-up itself is manual in their
panel. Keep a buffer of at least one month of renewals so settlement lag never
runs the balance to zero.

### Fraud posture

Crypto is irreversible, so pre-payment screening is the only control. Use
Turnstile on checkout, require a real email, cap order velocity (Durable Object
counter), and manually review the first orders above a threshold. Publish a
refund policy anyway — voluntary refunds are still a trust signal, and chargeback
rules simply do not apply.

## 6. Prerequisites before any code is written

Taste check: these are the complete things needed, not a start-anywhere list.

1. **Cloudflare account with Workers Paid** ($5/mo). Free will not run SSR.
2. **The domain on Cloudflare DNS.** Registrar optional; nameservers are not.
   Needed for custom domain, email, DKIM/DMARC and Turnstile.
3. **Zeno Bank account**: API key (`sk_…`), a webhook endpoint with its signing
   secret (`whsec_…`), and a decision on managed vs bring-your-own wallet.
4. **A funded rdp.monster balance.** Nothing provisions at $0, so end-to-end
   testing is blocked until this is done. This is upstream of the hosting
   choice.
5. **Secret inventory**, moved out of `.env` into `wrangler secret put`:
   `RDP_MONSTER_API_TOKEN`, `APP_SECRET`, `ZENO_API_KEY`,
   `ZENO_WEBHOOK_SECRET`, `RDPM_WEBHOOK_SECRET`.
6. **A funding loop.** Customer crypto lands in Zeno; rdp.monster is funded
   from *your* side and has no top-up API (`billing:read` only).
   **Decided: bring-your-own wallet** — funds land in a wallet you control and
   go straight to rdp.monster, with no $1 withdrawal fee and no 24 h hold.
7. **A written abuse/AUP position.** Cloudflare is now the front door to a
   no-KYC, crypto-paid RDP business; you will need a takedown process and a
   support contact on the site. This is already a risk in the risk register,
   not a new one, but Cloudflare's AUP applies to the storefront.

## 7. Migration order

1. Finish the in-flight D1 port: real `database_id`, apply `0001_orders.sql`
   to a new D1 database (never import over the source SQLite), then add
   `0002_zenobank.sql`.
2. Deploy the existing OpenNext + `wrangler.jsonc` setup to a `*.workers.dev`
   URL with `PROVISIONING_ENABLED=false` and `ALLOW_DEV_CHECKOUT=false`.
3. Replace `src/lib/stripe.ts` with `src/lib/zenobank.ts`; verify a checkout
   reaches `pay.zenobank.io` and the webhook flips the order to `PAID`.
4. Move provisioning into a Workflow with the create step set to zero retries.
5. Add the 5-minute reconciliation Cron Trigger.
6. Wire Email Service and publish SPF/DKIM/DMARC.
7. Replay the acceptance tests: catalogue render, dry-run quote, `402` path,
   invalid webhook signature rejected, duplicate `svix-id` ignored,
   `checkout.expired` never provisions, `checkout.partially_paid` never
   provisions, `429` backoff, credential encrypt/decrypt round-trip, order page
   polling to `ACTIVE`.
8. Point `PUBLIC_BASE_URL` and the provider webhook at the custom domain, then
   cut DNS over. Keep the old host for a week.

## 8. Risks specific to this move

| Risk | Note |
| --- | --- |
| WHMCS becomes dead code | Accept it, or keep a PHP host and don't migrate |
| `node:sqlite` is a non-functional stub in Workers | Must use D1; there is no drop-in |
| Workflow step retries double-provision | Disable retries on `POST /servers` explicitly |
| Crypto payments are irreversible | No chargebacks, but also no fraud reversal — screen before provisioning |
| Partial payments are swept to your balance | `checkout.partially_paid` still credits you; decide refund vs top-up-request policy |
| Webhooks are at-least-once | Dedupe on `svix-id`; provisioning must stay idempotent |
| Checkout expiry is short | Order must be re-checkoutable; do not create a second server for a re-paying customer |
| Settlement lag while topping up rdp.monster | BYO wallet removes withdrawal delay; keep a funded buffer so sales never stall |
| No refund API | Refunds are manual outbound transfers; budget network fees |
| No card fallback | If crypto is the only rail, conversion friction is the main drop-off |
| NGN/USD FX drift | Lock the rate at checkout creation; store it on the order and never re-quote |
| Email sending is beta | Have a fallback (Resend/Postmark) before launch |
| Cloudflare AUP / abuse handling | We host the shop, not the servers — but the front door is ours |
| D1 single-writer | Fine now; becomes the scaling ceiling later |
| Vendor concentration | The app is portable HTTP + SQL; keep the rdp.monster client framework-free (it already is) |
| 3389 is never proxied | Customers connect to provider IPs directly; do not promise DDoS protection on RDP |

## 9. What this does not solve

Moving to Cloudflare fixes hosting cost and ops burden. It does not fund the
reseller balance, create reseller products, register the Zeno webhook, or write
the Terms/Refund/AUP pages. Those remain the actual blockers to the first paid
order in `LAUNCH-REQUIREMENTS.md`.

Crypto-only also removes a blocker: there is no Stripe/PayPal entity
verification gate before launch. It replaces it with a funding loop — customer
crypto must be converted into rdp.monster balance, and that top-up is manual.

---

## Sources

- [Workers limits](https://developers.cloudflare.com/workers/platform/limits/)
- [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/)
- [Workers TCP sockets](https://developers.cloudflare.com/workers/runtime-apis/tcp-sockets/)
- [Containers overview](https://developers.cloudflare.com/containers/)
- [Container lifecycle / no inbound TCP](https://developers.cloudflare.com/containers/concepts/architecture/)
- [Container limits and instance types](https://developers.cloudflare.com/containers/platform/limits/)
- [Spectrum — custom TCP/UDP is Enterprise](https://developers.cloudflare.com/spectrum/)
- [Next.js on Workers](https://developers.cloudflare.com/workers/framework-guides/web-apps/nextjs/)
- [OpenNext adapter](https://developers.cloudflare.com/workers/framework-guides/web-apps/opennext/)
- [D1 limits](https://developers.cloudflare.com/d1/platform/limits/)
- [D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/)
- [Workflows](https://developers.cloudflare.com/workflows/)
- [Workflows pricing](https://developers.cloudflare.com/workflows/reference/pricing/)
- [Email Service](https://developers.cloudflare.com/email-service/)
- [Node.js compatibility](https://developers.cloudflare.com/workers/runtime-apis/nodejs/)
- [node:crypto in Workers](https://developers.cloudflare.com/workers/runtime-apis/nodejs/crypto/)
- [Zeno Bank API overview](https://docs.zenobank.io/api-reference/api-overview)
- [Zeno Bank — create a checkout](https://docs.zenobank.io/api-reference/checkouts/create-a-new-checkout)
- [Zeno Bank — webhooks](https://docs.zenobank.io/api-reference/webhooks)
- [Zeno Bank — payment flow](https://docs.zenobank.io/payment-flow)
- [Zeno Bank — fees](https://docs.zenobank.io/fees)
- [Svix manual verification](https://docs.svix.com/receiving/verifying-payloads/how-manual)
