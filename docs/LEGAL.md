# Legal pages — draft and go-live checklist

Status: **draft**. The pages exist and are linked from the footer, checkout and
order page, but they contain bracketed placeholders and have not been reviewed by
a lawyer. Do not publish them until the checklist below is complete.

Routes:

- `/terms` — Terms of Service
- `/privacy` — Privacy Policy
- `/refund` — Refund Policy
- `/acceptable-use` — Acceptable Use Policy

The shared layout is `src/app/(legal)/layout.tsx`; the entity placeholders and
links are in `src/lib/legal.ts`.

## Placeholders to replace

| Constant                     | Current value                          | Required before publish                 |
| ---------------------------- | -------------------------------------- | --------------------------------------- |
| `LEGAL_ENTITY.legalName`     | `[LEGAL ENTITY NAME]`                  | Registered entity or sole-trader name   |
| `LEGAL_ENTITY.address`       | `[REGISTERED ADDRESS]`                 | Business address                        |
| `LEGAL_ENTITY.jurisdiction`  | `[JURISDICTION]`                       | Governing-law country/state             |
| `LEGAL_ENTITY.companyNumber` | `[COMPANY / RC NUMBER, IF APPLICABLE]` | Registration number or “not applicable” |
| `LEGAL_ENTITY.contactEmail`  | `[CONTACT EMAIL]`                      | Monitored legal/privacy inbox           |
| `LEGAL_ENTITY.supportEmail`  | `[SUPPORT EMAIL]`                      | Monitored support inbox                 |

Also replace the generic “5 business days” and “10 business days” commitments in
the Refund Policy if the operating team cannot meet them.

## Policy decisions already reflected

- Brand is **WHATRDP**; the site header/footer use the WHATRDP wordmark and the
  rebuilt cloud/lock emblem.
- No refunds after provisioning. Manual review for non-delivery, duplicate
  payment, unauthorized payment and mandatory consumer rights; crypto refunds are
  sent to the originating wallet minus network fees.
- Partial payments do not provision; they may be topped up or refunded minus
  network fees at our discretion.
- Checkout shows policy links but does **not** require a checkbox and does not
  store acceptance. This is a deliberate links-only choice and is the weakest
  consent model; revisit if the business needs stronger evidence of acceptance,
  especially for the EU/UK withdrawal waiver.
- No uptime/SLA promise. The supplier controls the hardware, network and install
  time.
- 18+ only, no customer accounts, bearer order links remain the access model.
- Order/payment records are retained for service, dispute, tax and legal needs;
  encrypted D1 backups expire after 35 days.
- Order data is shared with Cloudflare (hosting, D1, email, backups, Turnstile),
  Zeno (checkout and settlement), and our infrastructure provider (plan, OS,
  term, quantity, internal label). Customer email is not sent to the provider.
  Operational alerts are designed to exclude email, credentials and order tokens.
- Customer-facing surfaces do not name the upstream infrastructure provider.
  WHATRDP is presented as a Cyberise project linking to `https://cyberise.org`;
  the contracting entity and contact addresses are still placeholders. Counsel
  should confirm that describing the recipient as “our infrastructure provider”
  satisfies applicable transparency requirements.

## Go-live checklist

- [ ] Replace every bracketed placeholder in `src/lib/legal.ts`
- [ ] Create and monitor the legal and support inboxes
- [ ] Confirm the registered entity, address, RC number and governing law
- [ ] Have Nigerian counsel review the terms, privacy and refund positions
- [ ] If selling to the EU/UK, review the consumer withdrawal waiver and the
      links-only consent model
- [ ] Confirm the infrastructure-provider and payment-provider terms permit the
      described flow
- [ ] Confirm with counsel that the generic infrastructure-provider disclosure is
      sufficient
- [ ] Confirm tax/VAT and accounting treatment for USD crypto sales
- [ ] Verify the footer, checkout note, order page and credential-email links
- [ ] Run `npm run ci`
- [ ] Release through the gated workflow only after review
- [ ] Re-check the live pages after release

## Verification hooks

- `src/components/SiteFooter.tsx` renders the legal links.
- `src/components/PlansConsole.tsx` renders the checkout note and links.
- `src/components/OrderConsole.tsx` renders the order-page links.
- `src/lib/email.ts` adds absolute policy links only when `PUBLIC_BASE_URL` is
  configured; `tests/unit/email.test.ts` covers both cases.

This document is an engineering checklist, not legal advice.
