# rdp.monster reseller — work log

Running record of discovery, decisions and open items for the remote-server
reselling business built on rdp.monster wholesale.

**Never write secret values in this file.** Credentials live in Replit secrets
only: `RDP_MONSTER_EMAIL`, `RDP_MONSTER_PASSWORD`, `RDP_MONSTER_API_KEY`.

---

## 2026-10-28 — discovery session

### Goal

Determine what is required to start reselling rdp.monster servers, and decide
between renting a VPS to subdivide versus reselling their inventory.

### Findings

**Panel**
- Client area is `https://dashboard.rdp.monster` (Next.js app behind Cloudflare).
- `manager.rdp.monster` is an alias of the same application, not a separate
  WHMCS install. There is one panel only.
- Login is protected by Cloudflare Turnstile. A headless browser cannot pass it
  (`Captcha verification failed`), so login must be done by a human in a real
  browser. Credentials were confirmed working by the account holder.

**API**
- Base URL: `https://dashboard.rdp.monster/api/v1`
- OpenAPI document: `GET /api/v1/openapi.json` (public, no auth required)
- Auth: `Authorization: Bearer rdpm_<32 chars>`
- Token scopes: `vps:read`, `vps:write`, `billing:read`
- Rate limit: 120 requests/minute per token; `429` with `Retry-After`
- All amounts are integer cents (USD)
- Lists are paginated with `page` / `perPage` (max 200) and return `meta`
- Billing periods: `MONTHLY`, `QUARTERLY`, `SEMIANNUALLY`, `ANNUALLY`,
  `BIENNIALLY`, `TRIENNIALLY`
- Errors: `{ "error": "<code>", "message": "…" }`

### Endpoint surface

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/account` | Balance, active services, unpaid invoices |
| GET | `/catalog` | Products, regions, plans (SKUs), OS templates, custom limits, reseller products, tier |
| GET | `/servers` | List servers |
| POST | `/servers` | Create one or more servers, paid from balance |
| GET | `/servers/{id}` | Details, IPs, resources, status |
| PATCH | `/servers/{id}` | Rename, tag, toggle auto-renewal |
| DELETE | `/servers/{id}` | Cancel and destroy immediately |
| GET | `/dedicated/offers` | Dedicated offers with stock and reseller price |
| POST | `/dedicated` | Order a dedicated server |
| GET | `/servers/{id}/install` | Reinstall/rescue status on dedicated |
| POST | `/servers/{id}/rescue` | Boot into or out of rescue mode |
| POST | `/servers/{id}/actions` | Power and access actions |
| GET | `/servers/{id}/reinstall` | Allowed OS templates |
| POST | `/servers/{id}/reinstall` | Reinstall with another OS (same IPs) |
| POST | `/servers/{id}/upgrade` | Quote or apply upgrade |
| GET/POST/DELETE | `/servers/{id}/downgrade` | Quote, schedule, cancel downgrade |
| GET | `/servers/{id}/metrics` | CPU, RAM, disk %, network (1h / 24h / 7d) |
| POST | `/servers/{id}/console` | White-label console session |
| POST | `/servers/{id}/renew` | Renew now for a period |
| POST | `/servers/{id}/cancel` | Stop at period end or destroy now |
| GET | `/invoices` | Invoices with items |
| GET | `/invoices/{id}` | One invoice with lines |
| POST | `/invoices/{id}/pay` | Pay unpaid invoice from balance |
| GET/POST | `/servers/{id}/ips` | List, add IPv4, change one |

Server creation accepts three shapes: a catalog plan (`plan` + `os` + `cycle`),
one of your own reseller offers (`resellerProduct` + `os`), or custom specs
(`region` + `tier` + `custom{cpuCores,ramMb,diskGb,ipv4Count}` + `os`).
`dryRun: true` returns the discounted quote without ordering.

### API key status — RESOLVED

The original secret was a 32-character string with no prefix and returned
`401 Token revoked or unknown`. It was replaced with a full `rdpm_…` token
(37 chars, name `replitcreation`, scopes `vps:read`, `vps:write`,
`billing:read`) and now authenticates successfully.

Verification one-liner:

```bash
curl -s "https://dashboard.rdp.monster/api/v1/account" \
  -H "Authorization: Bearer $RDP_MONSTER_API_KEY"
```

### Verified account state (2026-10-28)

```json
{
  "email": "cyberisetecnologies@consultant.com",
  "balanceCents": 0,
  "activeServices": 0,
  "unpaidInvoices": 0,
  "unpaidCents": 0,
  "reseller": { "tier": "bronze", "discountPercent": 15, "turnover30dCents": 0 },
  "token": { "name": "replitcreation",
             "scopes": ["vps:read", "vps:write", "billing:read"] },
  "rateLimitPerMinute": 120
}
```

- Balance is **$0.00** — nothing can be ordered until it is funded.
- Tier is **Bronze (15%)**; next tier is Silver at $100 of 30-day turnover.
- No servers, no unpaid invoices.
- `resellerProducts` is empty — no custom white-label offers defined yet.

### Catalog as returned by the API

- Products: `windows-rdp`, `linux-vps`, `dedicated-servers`
- Regions: `europe`, `usa`
- Tiers: `CLASSIC`, `HIGH_PERFORMANCE`
- 40 plans total. Windows RDP and Linux VPS are priced identically per SKU.
- OS templates: Windows Server 2022/2012; Ubuntu 24.04/22.04/20.04; Debian
  12/11; CentOS Stream 9/8; Kali.
- Custom specs are allowed per region/tier, e.g. Europe CLASSIC up to 32 cores,
  128 GB RAM, 1000 GB disk, 30 IPv4; Europe HIGH_PERFORMANCE up to 16 cores,
  64 GB RAM.
- Dedicated servers are not in `/catalog`; they come from `/dedicated/offers`.

Monthly list price vs Bronze cost (all regions share the same ladder):

| Spec (cores / RAM / disk) | List | Bronze cost | Margin |
| --- | --- | --- | --- |
| 2 / 6 GB / 40 GB | $8.99 | $7.64 | $1.35 |
| 4 / 8 GB / 70 GB | $16.99 | $14.44 | $2.55 |
| 6 / 12 GB / 90 GB | $29.99 | $25.49 | $4.50 |
| 12 / 24 GB / 150 GB | $41.99 | $35.69 | $6.30 |
| 24 / 64 GB / 200 GB | $82.99 | $70.54 | $12.45 |
| HP 2 / 4 GB / 60 GB | $13.99 | $11.89 | $2.10 |
| HP 4 / 8 GB / 100 GB | $25.99 | $22.09 | $3.90 |
| HP 6 / 16 GB / 140 GB | $47.99 | $40.79 | $7.20 |
| HP 8 / 32 GB / 180 GB | $87.99 | $74.79 | $13.20 |
| HP 10 / 48 GB / 220 GB | $119.99 | $101.99 | $18.00 |

Note the highest margin sits on the largest plans, so a catalogue weighted
towards the 12–24 core tiers needs fewer sales to clear the same profit.

### Integration brief — received and verified

Source: `attached_assets/rdp-monster-api-prompt_1793222080990.md` (318 lines).
It is the authoritative narrative companion to the OpenAPI document: request
and response shapes for every endpoint, the full error-code table, webhook
signature scheme, lifecycle rules and the pricing catalog.

Verification against the live API on 2026-10-28:

- All **40 SKUs** in the brief's catalog table exist, and every monthly,
  quarterly and yearly figure matches `/catalog` exactly — including the
  outlier `linux/usa/28` at $26.99/mo quarterly versus $26.66 for its Windows
  twin, which is genuinely in the live data and not a typo.
- `POST /servers` with `dryRun: true` returns exactly what the brief documents:
  `subtotalCents 899`, `resellerDiscountPercent 15`, `resellerDiscountCents 135`,
  `totalCents 764`, `balanceCents 0`.
- `GET /servers` returns an empty page with `meta.total 0`.
- **Stale in the brief:** its dedicated table (stock for `dedicated/550`) shows
  stock 1, but all three offers now report `stock: 0, available: false`.
  The brief itself warns stock moves constantly — always read
  `/dedicated/offers` before selling one.
- Dedicated reseller discounts are **per offer**, not the tier discount: 3% on
  `dedicated/550` at Bronze, none on `dedicated/548` and `dedicated/545`.

Rules worth keeping in mind while building:

- Everything is prepaid from balance; insufficient funds is `402
  insufficient_balance` and nothing is created or charged.
- Never blindly retry `POST /servers` on a 5xx — check `GET /servers` first,
  since a retry can double-provision.
- Poll `GET /servers/:id` every 5 s until `ACTIVE` for VPS; every few minutes
  for dedicated, which the team delivers by hand.
- Webhooks are `x-rdpm-signature: v1=<hex>` over `timestamp + "." + rawBody`,
  HMAC-SHA256, 10 s response budget, 6 retries with backoff, 5 min replay
  window. Always re-fetch the object rather than trusting the payload.
- `resellerProduct` slugs decouple the shop from their SKUs — the right choice
  for a white-label catalogue (currently empty on this account).

### Decisions

- **Resell inventory rather than subdividing a self-managed VPS.** Zero capex,
  ~10s provisioning, provider carries hardware and Windows licensing. Owning
  the hypervisor only becomes rational past roughly 20 servers/month.

### Open items

- [x] Update the `RDP_MONSTER_API_KEY` secret — done, token authenticates.
- [x] Confirm token scopes — `vps:read`, `vps:write`, `billing:read`.
- [x] OpenAPI spec obtained — byte-identical to the live
      `/api/v1/openapi.json` (SHA-256 `0211cf58…f1f6`).
- [ ] Fund the prepaid balance; it is currently $0.00.
- [ ] Define white-label offers in `resellerProducts` (currently empty).
- [ ] Decide the storefront stack (WHMCS vs custom panel).

---

## Program economics (from rdp.monster)

Discount is applied to orders, renewals, upgrades, add-ons and IPs, and is
driven by rolling 30-day top-ups.

| Tier | 30-day top-ups | Discount |
| --- | --- | --- |
| Bronze | $0–100 | 15% |
| Silver | $100–300 | 20% |
| Gold | $300–600 | 25% |
| Platinum | $600–1,200 | 30% |
| Diamond | $1,200–2,500 | 35% |
| Emerald | $2,500–5,000 | 40% |
| Ruby | $5,000–10,000 | 45% |
| Obsidian | $10,000+ | 50% |

Public plans (list price): Basic $8.99 (2c/6GB/40GB), Standard $16.99
(4c/8GB/70GB), Pro $29.99 (6c/12GB/90GB), Advanced $41.99 (12c/24GB/150GB),
Elite $82.99 (24c/64GB/200GB). Extra IPv4 is $1.75/month.

Margin reality check: at Bronze, Basic costs $7.64, so the spread is $1.35 per
server per month before your own markup. This is a volume business.

The provider's own example offers: `starter-eu` (2 vCPU / 4 GB / 60 GB) costs
$9.74 and retails $14.90; `trader-ny` (4 vCPU / 8 GB / 100 GB HP) costs $19.49
and retails $29.00; `bot-farm` (8 vCPU / 16 GB / 200 GB) costs $37.49 and
retails $54.00.

## Launch checklist

1. Reseller access approved — free, but gated behind a manual review of markets,
   sales channels and expected volume.
2. Valid `rdpm_` API token with all three scopes.
3. Prepaid balance funded by card, PayPal or crypto.
4. Storefront: WHMCS with the free provisioning module, Blesta/HostBill, or a
   custom panel against the REST API.
5. Own payment processing and support desk — the provider stays invisible and
   the customer relationship is ours.
6. Webhook endpoint for provisioning events (HMAC-SHA256 signed, auto-retried).

## Risk notes

- Provider is explicitly no-KYC and crypto-friendly; abuse-prone customers will
  gravitate here and the reseller of record absorbs that exposure.
- Billing is prepaid, so inventory must be funded before it sells.
- White-label means support and disputes are ours, not theirs.

---

## 2026-10-28 — storefront build

Two integrations scaffolded against the live API.

### WHMCS module (`whmcs/`)

PHP 8.1+, `curl` only, no Composer dependency.

- `modules/servers/rdpmonster/` — CreateAccount, Suspend, Unsuspend, Terminate,
  ChangePassword, ChangePackage, ClientArea, AdminServicesTabFields, admin
  buttons, TestConnection.
- `modules/addons/rdpmonster/` — HMAC-verified webhook receiver that syncs
  statuses and pulls credentials into the WHMCS service row.
- Token lives in the WHMCS server's **Access Hash** field; hostname is the base
  URL.
- Cycle mapping is automatic (Monthly → MONTHLY … Triennially → TRIENNIALLY).
- Dedupe: a 5xx on `POST /servers` triggers a label search before any retry, so
  a timed-out create cannot double-bill.
- All eight PHP files pass `php -l`. The API client was exercised live:
  `/account`, `/catalog` (40 plans), a `dryRun` quote ($8.99 → $7.64 at 15%)
  and a 404 path all returned correctly.

### Next.js storefront (`storefront/`)

Next 15 App Router, TypeScript, no UI framework. `npm run build` passes and
`tsc --noEmit` is clean.

- Catalogue server-rendered from `/catalog`; retail = list × 1.7 rounded to .99
  (Basic $8.99 → sells at $15.99).
- Stripe Checkout → webhook marks paid → `POST /servers` → order page polls
  until `ACTIVE` and reveals IP/user/password.
- Provider webhooks handled at `/api/webhooks/rdpmonster` with signature and
  5-minute replay checks.
- Credentials encrypted at rest with AES-256-GCM (`APP_SECRET`).
- Orders in SQLite via `node:sqlite` — swap for Postgres before running more
  than one instance.
- End-to-end test against the real account: checkout created order #1, the
  provisioning attempt hit the $0 balance, returned `402`, and the order stored
  the friendly "top up the reseller balance" message. No server was created and
  no duplicate appeared in `GET /servers`.

### Still open

- [ ] Top up the balance — nothing can be sold until it is funded.
- [ ] Create reseller products in the panel so the shop can sell your own
      offers instead of platform SKUs.
- [ ] Pick which path to production: WHMCS on shared hosting, or the Next app
      on a VPS with Postgres.
- [ ] Stripe live keys, business verification, terms/refund policy.

The full prerequisite list for operating the business lives in
`LAUNCH-REQUIREMENTS.md`.

---

## 2026-10-29 — Cloudflare hosting evaluation

### Question

Can the frontend and backend move entirely to Cloudflare, and can the RDP
reselling itself run there? Prompted by a tweet arguing Workers + D1 + R2 +
Durable Objects + Workflows now replace a Vercel-style stack.

### Answer

**The application: yes. The product: no.**

Cloudflare can host every piece of the business app — storefront, API, orders
DB, jobs, email, backups, DNS/WAF. It cannot host the Windows servers we resell,
and the docs are unambiguous about it. That is fine: the servers already live at
rdp.monster. "Everything on Cloudflare" means the shop moves; inventory stays.

Full write-up: `CLOUDFLARE-MIGRATION.md`.

### Verified from Cloudflare docs

- **Workers**: 128 MB/isolate, 5 min CPU max (30 s default), no wall-time limit
  on HTTP requests, 10,000 subrequests, 6 simultaneous outbound connections.
- **D1**: 10 GB per database (hard cap), single-threaded per DB, 1,000 queries
  per Worker invocation, 30 s query max, 2 MB row max, 30-day Time Travel.
- **Containers**: Linux/`amd64` only, max 4 vCPU / 12 GiB / 20 GB disk, disk is
  ephemeral, and "end-users cannot make non-HTTP TCP or UDP requests to a
  Container instance." Cannot be an RDP host on three independent counts.
- **Spectrum**: custom TCP/UDP requires Enterprise + paid add-on, and only
  proxies to an existing origin. Not a way to run servers, and not self-serve.
- **Workflows**: durable steps with automatic retries, sleep for weeks, 500k
  steps/month included.
- **Email Service**: outbound sending is beta, Workers Paid.
- **Node compat**: `node:crypto` fully supported (argon2 and ed448/x448
  excluded) — so `crypto.ts` and `signature.ts` need **no changes**.
  `node:sqlite` is only a non-functional stub — `store.ts` must move to D1.
- **Next.js**: OpenNext adapter is the documented path for our existing Next 15
  app; vinext is now the recommended default but is beta and targets Next 16.
- **Stripe**: official support exists, but the SDK's default transport is
  `node:https`, so the client must be built with `createFetchHttpClient()`.
  Webhook verification already uses `constructEventAsync` — correct as-is.
- **Cost**: Workers Paid $5/month covers Workers, D1, Durable Objects, Queues,
  Workflows and email sending allowances. R2 egress is free.

### Consequences

- **WHMCS is out.** ionCube-encoded PHP cannot run in a V8 isolate and the
  native loader cannot be supplied. If we move to Cloudflare, the Next
  storefront is the only storefront; keep `whmcs/` as the fallback.
- **Migration is contained**: one data-layer rewrite (sync → async D1), one
  Stripe client option, one Next adapter, plus moving provisioning into a
  Workflow.
- **Provisioning retry trap**: Workflows retry steps by default. The
  `POST /servers` step must be declared with zero retries; the existing
  `web-<id>` label dedupe stays as the backstop.
- **Hosting cost drops** from ~$10/mo (SkyNet) or ~$44/mo (Peek + WHMCS) to
  ~$5–6/mo.

### Still blocked upstream of hosting

Unchanged from launch requirements: $0 reseller balance, no reseller products,
no payment account, no legal pages. Moving hosts does not touch any of these.

### Open items

- [x] Decide: Cloudflare-only (drop WHMCS) or stay on PHP hosting — decided
      below, Cloudflare-only, custom code.
- [ ] Port `src/lib/store.ts` to D1 and switch to OpenNext.
- [ ] Review Cloudflare's AUP for a no-KYC-adjacent reseller storefront.
- [ ] Fund the reseller balance before any end-to-end test is meaningful.

---

## 2026-10-29 — payment rail and storefront decisions

Three constraints confirmed by the account holder:

1. **Inventory is resold through the rdp.monster API.** We do not host servers.
   Nothing about the Cloudflare move changes that.
2. **No WHMCS.** Everything is coded in-house. `whmcs/` is unused reference;
   `HOSTING-CHOICE.md` is marked superseded.
3. **Crypto-only payments, no Stripe.** Provider is Zeno Bank
   (`zenobank.io`), not a placeholder.

### Zeno Bank — verified from docs

- Auth: `X-API-Key: sk_…` header.
- Create: `POST https://api.zenobank.io/api/v1/checkouts` with
  `{ orderId, priceAmount, priceCurrency, successRedirectUrl }` where
  `priceAmount` is a **decimal string** (cents must become `"15.99"`).
- Response: `id` (`ch_…`), `status: OPEN`, `expiresAt`,
  `checkoutUrl: https://pay.zenobank.io/ch_…`.
- Status: `GET /api/v1/public/checkouts/{id}` — **public, no auth**, so the
  order page can poll it when a webhook is late.
- Webhooks: `checkout.completed`, `checkout.expired`,
  `checkout.partially_paid`. Svix/Standard Webhooks headers (`svix-id`,
  `svix-timestamp`, `svix-signature`), secret `whsec_…`, HMAC-SHA256 over
  `id.timestamp.rawBody`, verified against the **raw** body.
- Delivery is **at-least-once**, retried 5 s → 5 m → 30 m → 2 h → 5 h → 10 h.
  Dedupe on `svix-id`.
- Fees: **0.1%** (0.35% Lightning, 0% Binance Pay). Withdrawal **$1 + network
  fees**, up to 24 h, managed mode only. No fiat withdrawals.
- Intermediary-wallet model: customers may split a payment across tokens and
  networks; wrong-network sends are still detected.
- **No refund API** — refunds are manual outbound transfers.
- No KYC for merchant or customer.

### Design consequences

- Order statuses gain `EXPIRED` and `PARTIAL`. `completed` → `PAID` + start
  provisioning. `expired` and `partially_paid` **never** provision.
- Provisioning must be idempotent: at-least-once webhooks plus Workflow retries
  can both re-trigger. `svix-id` gets a unique index; `web-<orderId>` label
  dedupe stays.
- Payment is now created before redirect; the checkout id is stored on the
  order. After expiry, a **new** checkout is created and replaces the stored id
  (an expired checkout cannot be reopened).
- **Wallet mode: bring-your-own wallet (decided).** Funds sweep to our wallet,
  then to rdp.monster. No $1 withdrawal fee, no 24 h hold, no Zeno custody.
  Managed remains a dashboard switch if we ever want it.
- Settlement is still a loop, not automatic: customer crypto → our wallet →
  manual rdp.monster top-up (`billing:read` only, no top-up endpoint). Keep one
  month of renewals as a buffer.
- Fraud control moves entirely to pre-payment: Turnstile, real email, order
  velocity cap, manual review above a threshold. Irreversible payments mean no
  post-hoc recovery.

### Concurrent work discovered

While this evaluation was being written, the storefront was ported to
Workers/D1 in the working tree (uncommitted, timestamps 14:24–14:26):
`storage/{types,schema,repository}.ts`, `database.ts` + `database.cloudflare.ts`
(build-time alias), `payments.ts`, `provisioning.ts`, `migrations/0001_orders.sql`,
`open-next.config.ts`, `wrangler.jsonc`, root `package.json`/lockfile.

That port is still Stripe-based. **Do not rewrite the repository layer** — the
Zeno swap belongs in `src/lib/payments.ts` (`acceptCheckoutPayment`) plus a
`0002_zenobank.sql` migration. The atomic `claimPayment` / `claimProvision`
helpers it introduced are exactly what the at-least-once webhooks need, and
`REVIEW_REQUIRED` is a better outcome than `FAILED` for uncertain supplier
calls.

### Code delta queued (deliberately not landed yet)

- replace the provider inside `src/lib/payments.ts`; keep `claimPayment`
- delete `src/lib/stripe.ts` and `src/app/api/webhooks/stripe/route.ts`
- add `src/lib/zenobank.ts` (plain `fetch`, no SDK) and
  `src/app/api/webhooks/zenobank/route.ts` (WebCrypto HMAC verification)
- add `0002_zenobank.sql`: `checkout_ref` (generalise `stripe_session`),
  `webhook_events(svix_id UNIQUE)`, and room for `EXPIRED`/`PARTIAL` statuses
- rewrite `checkout/route.ts` to create a Zeno checkout instead of a Stripe
  session
- update `storefront/README.md` (it still describes Stripe and Node 22 SQLite)

Not landed because the D1 port above is still in flight and the payment swap
touches the same files. Also blocked on two inputs: **managed vs BYO wallet**,
and a real `sk_`/`whsec_` pair to test against.

### Open items

- [x] Wallet mode — **BYO**, decided 2026-10-29.
- [ ] Create the Zeno account, API key, webhook endpoint and signing secret.
- [ ] **Wait for the in-flight D1/OpenNext port to finish**, then land the Zeno
      swap on `src/lib/payments.ts` + `0002_zenobank.sql`. Do not edit the
      repository layer while that agent is active.
- [ ] Decide the partial-payment policy: top-up request or manual refund.
- [ ] Keep a funded rdp.monster buffer so settlement lag never stops sales.

---

## 2026-10-29 — shared memory for the two agents

CommandCode and the Replit Agent work on the same filesystem at the same time.
Until now each kept its own notes, and they had already drifted.

### What was built

- `AGENTS.md` — entry point: read order, authority table, rules, handoff format.
- `.agents/memory/decisions.md` — append-only, dated, ID'd decisions (D-001…).
  This is the authority; everything else points at it.
- `.agents/memory/current-state.md` — per-agent block: done / in progress /
  blocked. Each agent edits only its own block.
- `.agents/memory/ownership.md` — path claims with leases, so the two agents
  cannot edit the same file in the same minute.
- `.agents/journal/YYYY-MM-DD-<agent>.md` — append-only session logs, one per
  agent per day, so neither can clobber the other.
- `AGENTS-PROMPT.md` — the copy-paste session-start prompt, plus a one-line
  version.

### Drift that was already present

`reseller-launch-scope.md` said: "do not assume that this authorizes dropping
WHMCS, replacing live storage, or changing payment providers." All three have
since been explicitly authorised by the user. Rather than silently rewriting
another agent's file, the note is left intact and marked superseded by D-003
(no WHMCS), D-007 (D1) and D-004 (Zeno). This is exactly the class of error the
shared file prevents: a stale caveat outvoting a live instruction.

### New requirement recovered from the other agent's memory

Checkout must show **NGN and USD** (Nigeria + international). Zeno supports NGN
as `priceCurrency`, so both can be charged natively. Consequence recorded as
D-006 and added to the plans:

- the order stores `charge_currency`, `charge_amount_minor` and the `fx_rate`
  used — `amount_cents` stays the USD cost basis for margin;
- `claimPayment` compares against the **charged** amount, not the USD basis;
- FX is locked when the checkout is created and cached in KV with a short TTL.

### Still true

Nothing here unblocks the three real blockers: reseller balance is $0, no
reseller products, no Zeno account/keys.


