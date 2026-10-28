# RDP.monster Reseller Business: Launch Readiness

**Prepared:** 2026-10-28  
**Account and catalog checked:** 2026-10-28 22:45 UTC (23:45 Africa/Lagos)  
**Purpose:** Platform-neutral business checklist. This document does not select Replit, WHMCS, or another platform.

## Executive summary

The API credentials work for read access, and the account is approved for reseller pricing. At the time checked, the account had a **15% Bronze reseller discount but a $0.00 prepaid balance**, no active services, and no unpaid invoices. The live catalog contained 40 VPS/RDP plans across Europe and the USA. No custom reseller products had been defined, and all three listed dedicated-server offers showed zero stock.

**This account is not ready to accept paid orders yet.** The immediate blockers are funding the provider balance, defining an initial offer and retail prices, and closing the supplier-policy questions in this document. No order, top-up, payment, or account change was made.

The user’s stated launch scope is customers in Nigeria and internationally, with checkout in NGN and USD.

## 1. What was checked

Three authenticated **GET-only** requests were made to the RDP.monster API. Only non-sensitive account and catalog fields were retained; account email and server credentials were not retrieved or displayed.

| Check | Result at the check time |
|---|---|
| `GET /account` | HTTP 200; balance $0.00; 0 active services; 0 unpaid invoices; reseller tier Bronze; discount 15%; 30-day turnover $0.00 |
| API token permissions | `vps:read`, `vps:write`, `billing:read` |
| `GET /catalog` | HTTP 200; 3 product families; Europe and USA regions; 40 plans; 0 reseller products |
| `GET /dedicated/offers` | HTTP 200; 3 offers returned; all reported unavailable with stock 0 |

These figures can change. Recheck balance, catalog prices, stock and reseller tier before presenting a quote or accepting an order.

### Credential safety

- Keep the API key and webhook signing secret in server-side secret storage only.
- Do not put either secret into browser code, public repositories, customer messages or logs.
- The currently working token includes `vps:write`, which can create and modify services. Use a separate read-only token for development/reporting if the provider permits it; reserve write access for the production service that needs it.
- Track token expiry, revocation and any configured IP restrictions. The Replit deployment’s outbound address must be confirmed if the provider requires IP allowlisting.

## 2. What the API does and does not establish

### Documented operational behaviour

- The API uses Bearer authentication and scopes. The guide says the general limit is 120 requests per minute per token; some dedicated-server operations have lower limits.
- All API money amounts use integer US cents. Billing cycles may have a total price for the whole period, not a monthly amount.
- Orders, upgrades, add-ons and renewals are prepaid from the reseller balance. A low balance returns `402 insufficient_balance`; the guide says the failed order is not created or charged.
- VPS/RDP orders move through `PENDING` and `INSTALLING` before `ACTIVE`. The guide gives a typical provisioning interval of seconds to a few minutes.
- Dedicated machines are delivered by the provider team, not instantly. Availability and time to delivery vary.
- The API has quote/dry-run options for some order operations. A quote should be checked before showing or committing a customer price.
- `GET /catalog` and `GET /dedicated/offers` provide current catalog/stock information; do not use a static product list as the source of truth.
- `POST /servers/:id/cancel` can stop renewal at period end or destroy the service immediately. `DELETE /servers/:id` also destroys immediately and documents no data retention. The customer flow must distinguish these actions clearly.
- Reinstallation can replace the OS and erase data. Dedicated reinstall documentation explicitly says disks are wiped.
- Webhooks require HTTPS, HMAC-SHA256 verification over the timestamp and raw request body, a five-minute timestamp window in the supplied example, and a successful response within ten seconds. The guide says failed deliveries are retried up to six times and recommends fetching the authoritative object from the API rather than trusting webhook data alone.

### Not established by the API documents

Do not promise any of the following until RDP.monster confirms them in writing:

- Refund eligibility, partial refunds, failed-install compensation or chargeback handling.
- Uptime guarantees, support response times, maintenance notice or service credits.
- Backup availability, retention, restoration time or responsibility for customer backups.
- Expiry grace periods, exact suspension/deletion timelines, and data retention after expiry.
- Windows Server licence coverage and the reseller’s right to advertise those Windows plans.
- Who handles abuse reports, evidence requests, compromised servers and urgent suspension.
- The minimum balance top-up, payment settlement timing, or whether a top-up can be reversed.
- Whether there is a true billing suspension control; powering a server off is not proof that billing stops.
- Any tax, privacy or consumer-law responsibility the provider accepts on the reseller’s behalf.

### Differences between the supplied API files

The Markdown integration brief describes webhooks, but the supplied OpenAPI document has no top-level webhook definitions. The OpenAPI examples also do not consistently match the live catalog. The account’s current API response is the best available source for current prices, product availability and stock; confirm webhook configuration and payloads in the provider dashboard or with support before launch.

## 3. Current product and funding position

### Catalog position

- Standard VPS/RDP plans are available through the normal `plan` order shape. An empty `resellerProducts` list does not by itself prevent selling standard catalog plans.
- No custom reseller offers exist in the account at this check. Create them only if you need your own provider-side named offers; confirm their pricing and setup requirements first.
- The three dedicated offers were all out of stock at the check time. Do not advertise dedicated products as available until a fresh check confirms stock, and do not promise instant delivery.
- The live catalog included Windows RDP and Linux VPS products for Europe and the USA. Public list values for the smallest example plan were $8.99 per month, $23.97 per quarter, and $89.88 per year. These are catalog values, not a guaranteed reseller quote or a final retail price.

### Funding blocker

The current $0.00 balance means there is no provider credit for an API order. Before enabling checkout:

1. Ask the provider for its minimum top-up and payment settlement timing.
2. Choose an initial reserve based on actual planned orders and renewals—not an assumed minimum.
3. Add credit through the provider’s approved account flow.
4. Confirm the balance and discount using a fresh read-only account check.
5. Pause new sales automatically if available credit is below the safe operating threshold.

The 15% Bronze discount is confirmed in the account response, but use the API quote/dry-run result for the actual supplier charge. Do not assume every product, add-on or dedicated offer gets the same discount. Do not add funds solely to chase a higher tier unless expected sales make the cash commitment worthwhile.

## 4. Business decisions required before checkout

### Initial product scope

Choose a small set of products and document for each:

- OS, region, CPU, RAM, storage, IP count and network/bandwidth description.
- Customer type and permitted use.
- Retail price in NGN and USD.
- Billing period and renewal amount.
- Expected delivery time and support boundaries.
- Whether the customer can power, reinstall, reset passwords, change plans or cancel.

For an initial pilot, VPS/RDP is easier to operationalize than dedicated servers because VPS provisioning is automated and current dedicated stock is zero. Keep dedicated sales disabled unless the provider confirms current stock and delivery terms.

### Customer payment rules

Select payment methods that your business is approved to use for hosting services and that can support the intended NGN and USD flows. Before choosing a gateway, verify merchant eligibility, settlement currency/timing, fees, conversion spread, refunds, recurring payments and dispute handling.

Required payment controls:

- Provision only after server-side verification of the payment amount, currency and order reference.
- Do not treat a browser redirect, screenshot or unverified notification as payment proof.
- Make payment notifications idempotent so retries cannot create duplicate servers.
- Keep your customer invoice/payment records separate from the provider’s invoices.
- Define what happens if customer payment succeeds but server provisioning fails.

### Renewal and cancellation policy

Choose one renewal authority:

1. Provider auto-renewal using your prepaid balance; or
2. Your billing process charging the customer first and then explicitly renewing upstream.

Do not let both systems renew independently. Define invoice reminders, customer payment deadlines, grace periods (if confirmed by the provider), cancellation timing and the point at which data may be destroyed. Make end-of-period cancellation the clear default if consistent with provider rules. Treat immediate cancellation, termination and reinstall as destructive actions requiring clear confirmation.

## 5. Pricing and operating-budget worksheet

No gateway, hosting or legal-service fees are invented here. Fill in the blanks with confirmed quotes and your own sales assumptions.

### Per-order margin

Calculate per billing cycle and in integer currency units:

```text
Supplier cost (USD)
  = provider quote in cents / 100

Customer receipts (USD-equivalent)
  = customer charge
    - payment-processing fee
    - FX conversion spread/fee
    - applicable tax withheld or collected

Contribution per order
  = customer receipts (USD-equivalent)
    - supplier cost
    - other per-order operating costs
```

For NGN checkout, record the exchange-rate source, quote time, expiry of that quote and who bears later FX movement. Recalculate retail prices when provider costs, processor fees or exchange rates change.

```text
Break-even monthly orders
  = ceiling(monthly fixed costs / average contribution per order)
```

Contribution is not net profit until fixed operating costs, tax, owner labour and reserves are accounted for.

### Cash required

| Budget line | Amount to establish | How to calculate |
|---|---:|---|
| Initial provider credit | $___ | Provider minimum plus expected initial paid orders |
| Renewal reserve | $___ | Wholesale cost of active services coming due during the reserve window |
| Settlement-gap reserve | $___ | Supplier cost of orders placed before customer funds are available |
| Refund/dispute reserve | $___ | Estimate from actual processor rules and business risk |
| Payment/FX fees | ___ | Actual gateway fees, conversion spread and payout fees |
| Store/billing/hosting costs | ___ | Actual quoted monthly and setup fees after platform choice |
| Domain, email and support tools | ___ | Actual supplier quotes |
| Legal, registration and tax costs | ___ | Confirm with local qualified advisers |
| Contingency | $___ | Defined percentage or scenario-based reserve |

```text
Launch cash target
  = initial provider credit
    + renewal reserve
    + settlement-gap reserve
    + refund/dispute reserve
    + one-time setup costs
    + contingency
```

The account’s current provider balance is $0.00. The provider guide does not specify a minimum top-up, so the exact amount needed to begin cannot yet be determined.

## 6. Service operations and customer protection

Before the first paid order, the operating process must cover:

- Catalog/stock refresh and price expiry before checkout.
- Payment verified → order linked to one customer → one upstream creation request.
- Provisioning status updates and recovery if a request times out.
- Wait until provider status is `ACTIVE` before sending connection details.
- Secure credential delivery; never put server passwords in logs, URLs, analytics or email unless a protected delivery design is confirmed.
- Customer ownership checks on every power, console, password, reinstall, upgrade and cancellation action.
- Reconciliation of customer orders, provider service IDs, invoices, renewals and account balance.
- A queue or manual process for provisioning failures and provider support references.
- Alerts for low balance, token expiry, failed payment, failed webhook, expiring service, failed renewal and stock changes.
- A support contact, business hours, first-response target and escalation process.
- Abuse intake, customer identity/fraud checks proportionate to risk, evidence retention, provider notification and response process.
- Terms, acceptable-use, privacy and refund policies accessible before payment.
- Business records and backups of customer/order/configuration data, with a tested restore procedure.

Treat server credentials as sensitive data. Do not expose the RDP.monster API token to customers. Use provider-signed webhook verification, duplicate-event handling and a periodic reconciliation job; do not rely on webhook delivery alone.

## 7. Launch stages and acceptance checks

### Stage A — Supplier readiness

- [ ] Reseller approval and reseller rights confirmed.
- [ ] Refund, uptime, backups, Windows licensing, expiry, abuse and escalation policies confirmed.
- [ ] Minimum top-up and balance funding/settlement rules confirmed.
- [ ] Token expiry and IP allowlisting requirements understood.
- [ ] Current catalog and product-specific restrictions checked.

### Stage B — Business readiness

- [ ] Initial products, regions, terms, support coverage and acceptable-use rules selected.
- [ ] Payment method eligibility for hosting and NGN/USD confirmed.
- [ ] Provider costs, FX, processor fees, taxes and target margins entered in the worksheet.
- [ ] Cash reserve covers orders during payment settlement delays and upcoming renewals.
- [ ] Refund, cancellation, renewal, privacy and support policies are published.

### Stage C — Controlled test before public sales

- [ ] A non-destructive, read-only connectivity check succeeds.
- [ ] Use quote/dry-run requests before any test purchase.
- [ ] A separately approved small paid test validates payment, creation, ACTIVE status, credential delivery, renewal handling and cancellation.
- [ ] Duplicate notification and timeout recovery are tested without creating extra paid services.
- [ ] Customer-to-server ownership and admin access restrictions are checked.
- [ ] Immediate deletion/reinstall protections and recovery steps are checked.
- [ ] Reconciliation, low-balance alert and stop-sales procedure are verified.
- [ ] Only after the checks pass, enable public orders and monitor the first customers manually.

Paid tests, top-ups, cancellation, reinstallation and any action that can create a charge or destroy data require explicit approval; none were performed for this readiness review.

## 8. Provider questions to send before launch

1. What is the minimum top-up, and how long do card/PayPal/crypto top-ups take to become spendable?
2. What happens to VPS and dedicated data at expiry, suspension and termination? Is there a grace period or recoverable backup?
3. What refund or credit applies if provisioning fails, stock disappears, or service is unavailable?
4. What uptime and support response commitments apply to resellers?
5. Are Windows Server licences included for commercial resale, and what usage is prohibited?
6. How does a reseller suspend a customer for non-payment without merely powering off the server?
7. Who handles abuse reports and urgent security incidents, and what response time is required from the reseller?
8. Are there required customer verification, prohibited-use, record-keeping or geographic restrictions?
9. Can reseller offers be created with distinct pricing, and how are their margin and tier discounts calculated?
10. What are the exact webhook retry schedule, event IDs/deduplication guidance, signing-secret rotation process and event payload guarantees?
11. Do dedicated offer stock values update in real time, and what is the expected delivery/cancellation/refund process after an order is accepted?
12. Are customer-facing console, reinstall and password-reset features allowed to be white-labelled and exposed by resellers?

## Decision gate

The next decision should wait until the provider-policy questions, initial products, payment eligibility, and starting cash reserve are settled. Platform choice is deliberately left open in this document.
