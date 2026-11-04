# Product scope

## Purpose and audience

Sell remote-server capacity to Nigerian and international customers through an
in-house storefront. The upstream infrastructure provider supplies and operates
the servers; our business handles pricing, payments, support and customer
records. Public positioning is anonymous-first, and WHATRDP is presented as a
Cyberise project.

## Current behavior

- Server-rendered live inventory with location, class, term and OS selectors and
  USD pricing.
- Public pages, emails and customer-facing errors do not name the upstream
  infrastructure provider. The legal pages refer to "our infrastructure
  provider" instead. Internal source, docs and history still name it.
- Existing bearer-link orders can display service status and encrypted-at-rest
  credentials. These links are secrets, not a replacement for customer accounts.
- Provider HMAC verification and authoritative service-status synchronization.
- Conditional payment/provisioning claims, bounded read retries and review
  handling for ambiguous billable requests.
- **Checkout and fulfilment are implemented and enabled in both environments**
  (D-018, D-019, D-032). One staging order was verified end to end and its
  credential email received before production was enabled in the same reviewed
  change that removed the D-024 guard; production was released on 2026-11-02.
  A paid order provisions a server through the durable Workflow. A deleted
  supplier service marks the order `CANCELLED` and clears stored credentials. A
  five-minute bounded reconciliation run re-syncs stuck orders and re-dispatches
  `PAID` fulfilment only while that environment's switch is on (D-020). Checkout
  checks the live supplier balance (plus a configurable renewal reserve) before
  creating an order and fails closed if it cannot be verified (D-021). Checkout
  is rate-limited per client IP and supports Turnstile verification when both
  keys are configured (D-023).

## Intended launch, not completed features

- Zeno crypto checkout with customer-owned wallet delivery, verified and deduped
  notifications, authoritative settlement and charged USD amount matching.
- Customer accounts and ownership checks beyond the accepted bearer-link
  model (D-022), and restricted support/admin tools.
- Durable outbox/background fulfilment, recovery and shared supplier rate limits.
- Explicit renewal and cancellation policies. Refund and partial-payment
  positions are drafted in the legal pages; renewal and cancellation are still
  handled manually.
- Privacy, terms, refund and acceptable-use pages are drafted under
  `src/app/(legal)`. Entity/contact placeholders and legal review are still
  required before publication. Invoices, transaction records, support and dispute
  handling remain unimplemented.

Before enabling sales, verify merchant/provider eligibility, current supplier
products and balance, pricing/margin/FX policy, operating reserves, licences,
legal obligations and an approved controlled end-to-end transaction. Do not
assume an old funding snapshot is still current.

Repository cleanup does not implement or enable any of these launch features.
