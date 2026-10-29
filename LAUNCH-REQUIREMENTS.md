# What it takes to run this business

Everything required to operate a hosting reseller business on rdp.monster's API,
split into what is already done, what is missing, and what only becomes relevant
at a later stage.

Account: `cyberisetecnologies@consultant.com` · tier **bronze (15%)** · balance
**$0.00** · servers **0** · reseller products **0**.

---

## 1. Provider side — rdp.monster

| # | Requirement | Status |
| --- | --- | --- |
| 1.1 | Client account in good standing | done |
| 1.2 | Reseller access approved (tier visible on `/account`) | done |
| 1.3 | API token, `rdpm_…`, scopes `vps:read` + `vps:write` + `billing:read` | done (`replitcreation`) |
| 1.4 | Prepaid balance funded | **missing — $0.00** |
| 1.5 | Your own reseller products defined | **missing — none** |
| 1.6 | Webhook endpoint registered with a signing secret | missing |
| 1.7 | Support channel with the provider (Telegram/email) | unverified |

Notes that matter:

- **Reseller products can only be created in the client area.** The OpenAPI
  document exposes `resellerProducts` as a read-only field of `/catalog`; there
  is no create/update endpoint. Without them you sell platform SKUs at list
  minus 15%.
- **Dedicated servers are all out of stock right now** (`dedicated/548`,
  `/550`, `/545` all report `stock: 0, available: false`). You cannot sell
  dedicated until stock returns, and discounts on them are per-offer, not your
  tier rate.
- Webhooks are configured in the panel, not through the API: HTTPS endpoint,
  events `server.created`, `server.delivered`, `server.renewed`,
  `server.deleted`, `server.suspended`, `service.expiring`, HMAC-SHA256 signed.

## 2. Working capital

- Prep **$300–500**, not $100. Balance is spent the moment a customer's server
  is created, and `autoRenew` will draw it down again at each expiry.
- A Basic costs $7.64 at Bronze; $500 funds roughly 65 of them.
- Reaching **Silver (20%) needs $100** of top-ups in a rolling 30-day window;
  Gold (25%) needs $300. The tier falls back if top-ups slow, so a quiet month
  raises your costs.
- Top-ups by card, PayPal or crypto — all prepaid, all in USD cents.
- Keep a reserve equal to one month of renewals, or live servers expire.

## 3. Pricing and product design

- Decide retail per plan. A 1.7× multiplier on list (Basic $8.99 →
  $15.99) yields ~52% gross margin against a $7.64 cost.
- At Bronze, reselling the entry plan at list earns $1.35/month — not enough to
  fund support. Price deliberately or sell the larger plans, where the spread
  reaches $12.45 on the 24-core box.
- Decide term mix. Annual prepay improves cash flow and locks margin.
- Define what is included: extra IPv4 ($1.75/mo each, max 30), upgrades,
  reinstalls, backups (you must provide these yourself — the provider does not).

## 4. Storefront platform — decided

**Custom Next.js storefront (`storefront/`), hosted on Cloudflare Workers.**
Everything is coded in-house; WHMCS is not used and does not need hosting.
`whmcs/` stays in the repo as unused reference only.

- Workers + D1 + Workflows + R2, ~$5/month
- Full control of UX, pricing and the provisioning flow
- We own support, dunning and tax ourselves
- Inventory comes from the rdp.monster API — we do not host servers

Migration plan and constraints: `CLOUDFLARE-MIGRATION.md`.
`HOSTING-CHOICE.md` is superseded — it evaluates PHP hosting we no longer need.


## 5. Payments — crypto only (Zeno Bank)

No Stripe, no PayPal, no card rails. Zeno Bank hosts the checkout page; we
create a checkout over their API and provision on a signed webhook.

- **Account:** `dashboard.zenobank.io` → Developers → API key (`sk_…`) and a
  webhook endpoint with signing secret (`whsec_…`).
- **Fees:** 0.1% per payment (0.35% Lightning, 0% Binance Pay).
- **KYC:** none required of merchant or customer. That removes the entity
  verification gate, but not tax/accounting obligations.
- **No chargebacks.** Payments are irreversible — screening happens before
  provisioning, not after.
- **No refund API.** Refunds are manual outbound transfers; budget network fees.
- **NGN and USD at checkout.** Zeno supports both as `priceCurrency`, so both
  are charged natively. Store the charged currency, amount and FX rate on the
  order; the USD cost basis is for margin, not for validating payment.
- **Funding loop (BYO wallet, decided):** customer crypto sweeps straight to
  your own wallet, then to rdp.monster's top-up address. No withdrawal fee or
  24 h hold. The top-up itself is manual because the API is `billing:read` only.
  Keep one month of renewals as a buffer.
- Publish a refund policy anyway: it is a trust signal and EU consumer rules
  still apply to the service, even if card-network chargeback rules do not.

## 6. Fulfilment and automation

- Provisioning integration — written against the live API.
- Webhook receiver with signature verification — written for both providers.
- Credential delivery: the order page, plus email.
- **Reconciliation job**: any order stuck in `PAID`/`PROVISIONING` for more than
  10 minutes must be re-synced. `POST /servers` is deliberately never retried
  automatically, because a duplicate costs you money.
- Rate limiting: 120 requests/minute per token; back off on `429` using
  `Retry-After`.
- Balance guard: alert when `balanceCents` is low, and pause sales on `402`.

## 7. Support and operations

- Ticketing or a monitored support inbox with a published response time.
- Runbooks for the common requests: reboot, reinstall, password reset, IP
  change, upgrade, cancellation.
- Status page for outages.
- Abuse process: who investigates, what evidence, when a server is terminated.
- Escalation path to the provider for dedicated delivery and hardware faults.

## 8. Legal and compliance

- Business entity, tax registration, business bank account.
- Terms of Service, Acceptable Use Policy, Privacy Policy, Refund Policy, SLA.
- GDPR if you sell in the EU: lawful basis, data processing records, and a
  processor agreement with your hosting and payment providers.
- EU consumer law: digital services can waive the 14-day withdrawal right, but
  the waiver must be explicit at checkout.
- **Abuse liability is yours.** No-KYC hosting attracts fraud, spam, scraping
  and bot farms; as reseller of record you absorb complaints, IP reputation
  damage and provider termination risk.

## 9. Technical infrastructure

- Domain, DNS, TLS certificates.
- Application hosting: Cloudflare Workers, with D1 as the persistent database
  (10 GB cap per database, single-writer). No server to patch.
- Secrets management for the API token, `APP_SECRET` and webhook secrets —
  never in the repo.
- Backups of customer records and order history.
- Monitoring: alert on `401/403` (token broken), `402` (balance dry), `5xx`,
  provisioning failures, and webhook delivery failures.
- **Email deliverability**: SPF, DKIM, DMARC. Credentials arrive by email; if
  they land in spam, you generate support tickets on day one.

## 10. Marketing and acquisition

- A storefront with clear pricing and a fast checkout.
- Trust signals: uptime evidence, reviews, published refund policy, real
  support contact.
- Channels where this audience actually is: trading/forex communities, bot
  hosting forums, Telegram groups, SEO for "cheap Windows RDP".
- Comparison content against the better-known hosts.

## 11. Financial operations

- Invoicing customers and recording VAT/sales tax where applicable.
- Monthly reconciliation: provider invoices (cost) versus customer payments
  (revenue), per server.
- Track churn and renewal rate — prepaid hosting businesses die from silent
  non-renewals.
- Currency: everything upstream is USD; mind FX if you bill locally.

## 12. Risk register

| Risk | Mitigation |
| --- | --- |
| Single supplier | Keep the integration portable; the API is standard REST |
| Prepaid balance drained by autoRenew | Low-balance alerts, renewals reserve |
| Duplicate provisioning on retry | Label-based dedupe, manual reconciliation |
| Abuse by customers | AUP, verification, rapid termination process |
| Irreversible crypto payments | Pre-payment screening: Turnstile, email check, order-velocity cap, manual review above threshold |
| Partial / underpaid checkouts | `checkout.partially_paid` never auto-provisions; top-up request or manual refund |
| Settlement lag (up to 24 h withdrawal) | Keep a funded reseller buffer so sales never stall |
| Tier downgrade raises costs | Model margin at Bronze, not at the tier you hope for |
| Provider stock/offer changes | Always read `/catalog` and `/dedicated/offers` before selling |

---

## Minimum viable path to the first paid order

1. Top up the balance with at least $100 (reaches Silver).
2. Create 2–3 reseller products in the client area with retail prices.
3. Deploy the Next storefront to Cloudflare Workers on the domain.
4. Create the Zeno Bank account, register the webhook, and take one crypto
   payment end to end in production.
5. Publish Terms, Refund Policy and AUP pages.
6. Register the rdp.monster webhook endpoint and set its signing secret.
7. Sell one server to yourself, end to end, and confirm credentials arrive.
