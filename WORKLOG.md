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


