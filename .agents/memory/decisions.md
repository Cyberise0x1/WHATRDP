# Decisions

Authoritative, **append-only**. Newest at the bottom. Never edit or delete an
entry — supersede it with a new one and name the old ID.

Format: `- **D-00N · YYYY-MM-DD · <decider>** — <decision>. <why / consequence>`

---

- **D-001 · 2026-10-28 · both** — Resell rdp.monster inventory through their
  API; do not rent a hypervisor and subdivide it. Zero capex, the provider
  carries hardware and Windows licensing, provisioning is ~10 s.

- **D-002 · 2026-10-29 · user** — Host the frontend and backend entirely on
  Cloudflare: Workers for the app, D1 for the database, Workflows for
  background jobs, R2 for object storage. The RDP servers stay at rdp.monster;
  Cloudflare cannot host them (Containers are Linux-only, max 4 vCPU / 12 GiB /
  20 GB, ephemeral disk, and reject inbound non-HTTP TCP; Spectrum custom TCP
  needs Enterprise).

- **D-003 · 2026-10-29 · user** — **No WHMCS.** Everything is coded in-house.
  Supersedes `HOSTING-CHOICE.md` and the WHMCS option in
  `LAUNCH-REQUIREMENTS.md`. `whmcs/` is unused reference only.

- **D-004 · 2026-10-29 · user** — Payments are **crypto only, via Zeno Bank**;
  Stripe and PayPal are out of scope for launch. Supersedes the caveat in
  `reseller-launch-scope.md` ("do not assume … changing payment providers") —
  the user has now explicitly authorised it.

- **D-005 · 2026-10-29 · user** — Zeno wallet mode: **bring your own wallet**.
  Funds sweep to our wallet, then to rdp.monster. No $1 withdrawal fee, no 24 h
  hold, no Zeno custody.

- **D-006 · 2026-10-29 · user (via memory)** — Checkout must present **NGN and
  USD**. Zeno supports NGN for `priceCurrency`, so both are chargeable natively.
  Consequence: an order stores the **charged** currency and amount, not only USD
  cents. `claimPayment` must compare against the charged amount.

- **D-007 · 2026-10-29 · both** — D1 is the production database. The
  `node:sqlite` driver stays for local tests only, selected by a build-time
  alias. Production never imports over the source SQLite file.

- **D-008 · 2026-10-29 · Replit Agent** — Provisioning is claim-first:
  `claimProvision()` persists intent **before** the billable `POST /servers`.
  An uncertain outcome (network error / upstream 5xx) goes to `REVIEW_REQUIRED`
  and is never retried automatically. `claimPayment()` is a conditional UPDATE
  so duplicate webhooks cannot win twice.

- **D-009 · 2026-10-29 · CommandCode** — Zeno integration lands on the existing
  `src/lib/payments.ts` seam plus a `0002_zenobank.sql` migration. Do not
  rewrite the repository layer; its atomic claims are required by Zeno's
  at-least-once webhooks.

- **D-010 · 2026-10-29 · CommandCode** — Webhook verification is implemented
  with WebCrypto (HMAC-SHA256 over `svix-id.svix-timestamp.rawBody`, key =
  base64-decoded `whsec_…`), not an SDK. Dedupe on `svix-id`, reject timestamps
  older than 300 s.

- **D-011 · 2026-10-29 · Replit Agent** — Cloudflare runtime validation must
  exercise the final Wrangler-packaged artifact, not merely a successful Next
  build or raw adapter output.
  **Why:** raw adapter modules omit Wrangler's Node-compatibility shims;
  successful compilation alone hid an unsupported native SQLite import.
  **How to apply:** test the packaged Worker in workerd with disposable data
  and intercepted external requests before treating an adapter change as safe.

- **Repository distribution · 2026-10-29 · user** — Prepare the codebase for
  GitHub CI/CD and remove legacy WHMCS and Stripe implementation.
  **Why:** the user said these integrations are no longer needed and requested
  a clean repository before continuing.
  **How to apply:** remove obsolete active integrations during the approved
  cleanup, while preserving customer data and historical migration integrity.
