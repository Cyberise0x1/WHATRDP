# Product scope

## Purpose and audience

Resell RDP.monster remote-server inventory to Nigerian and international
customers through an in-house storefront. The provider supplies and operates the
servers; our business handles pricing, payments, support and customer records.

## Current behavior

- Server-rendered provider catalogue with term and OS selectors and USD pricing.
- Existing bearer-link orders can display service status and encrypted-at-rest
  credentials. These links are secrets, not a replacement for customer accounts.
- Provider HMAC verification and authoritative service-status synchronization.
- Conditional payment/provisioning claims, bounded read retries and review
  handling for ambiguous billable requests.
- **No public payment acceptance or new order creation.** Checkout returns 503
  with `payments_not_configured`; catalogue purchase buttons are disabled.

## Intended launch, not completed features

- Zeno crypto checkout with customer-owned wallet delivery, verified and deduped
  notifications, authoritative settlement and charged NGN/USD amount matching.
- Customer ownership checks, account access and restricted support/admin tools.
- Durable outbox/background fulfilment, recovery and shared supplier rate limits.
- Explicit renewal, cancellation, partial-payment, refund and dispute policies.
- Invoices, transaction records, support, privacy, terms and abuse procedures.

Before enabling sales, verify merchant/provider eligibility, current supplier
products and balance, pricing/margin/FX policy, operating reserves, licences,
legal obligations and an approved controlled end-to-end transaction. Do not
assume an old funding snapshot is still current.

Repository cleanup does not implement or enable any of these launch features.
