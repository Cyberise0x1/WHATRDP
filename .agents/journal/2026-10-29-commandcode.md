# 2026-10-29 — CommandCode

## Cloudflare hosting evaluation

Read the Cloudflare docs (Workers limits, D1 limits, Containers lifecycle,
Spectrum, Workflows, Email Service, Node compat, Next.js/OpenNext) and Zeno Bank
docs (checkouts, webhooks, payment flow, fees, withdrawals, supported
currencies).

Findings:

- The storefront/API ports cleanly to Workers. `node:crypto` is fully supported,
  so `crypto.ts` and `signature.ts` need no changes. `node:sqlite` is only a stub
  → D1.
- The RDP servers cannot move: Containers are Linux-only, max 4 vCPU / 12 GiB /
  20 GB, ephemeral disk, and explicitly reject inbound non-HTTP TCP. Spectrum
  custom TCP needs Enterprise. Neither matters because the inventory stays at
  rdp.monster.
- WHMCS cannot run in a V8 isolate (ionCube needs a native loader). Moot — the
  user dropped it.
- Zeno: hosted checkout, 0.1% fee, Svix-signed webhooks with at-least-once
  delivery, public status endpoint (no auth), **no refund API**, **NGN
  supported** as `priceCurrency`.
- **State of the code (2026-10-29):** a Workers/D1 port is already in flight in
  the working tree, still Stripe-based. Dates: 14:24–14:26. CommandCode did not
  edit it.

Wrote `CLOUDFLARE-MIGRATION.md`; rewrote payments in `LAUNCH-REQUIREMENTS.md`;
marked `HOSTING-CHOICE.md` superseded; logged in `WORKLOG.md`.

## Shared memory protocol

Built `AGENTS.md`, `.agents/memory/{decisions,current-state,ownership}.md`,
updated the memory index, marked the stale caveat in `reseller-launch-scope.md`,
and wrote `AGENTS-PROMPT.md` for both agents.

Found one real contradiction to fix: the scope note said not to assume a payment
provider change, while the user had already chosen Zeno. Recorded as D-004 with
an explicit supersede, rather than silently rewriting the other agent's file.

Also captured a gap neither doc had: checkout must handle **NGN and USD** (D-006),
which means an order must store its charged currency and amount, not just USD
cents.

### Handoff 2026-10-29T15:20Z
Changed:   AGENTS.md, AGENTS-PROMPT.md, .agents/memory/*, WORKLOG.md,
           CLOUDFLARE-MIGRATION.md, LAUNCH-REQUIREMENTS.md, HOSTING-CHOICE.md
Verified:  documentation only — no code run
Not done:  Zeno adapter, NGN pricing, real D1 database id
Blocked by:Replit Agent owns storefront/** until its D1 port is RELEASED;
           no Zeno account (`sk_`, `whsec_`)
Next:      wait for the port, then swap the provider in
           `storefront/src/lib/payments.ts` and add `0002_zenobank.sql`
