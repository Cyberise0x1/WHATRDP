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

- **Repository packaging · 2026-10-29 · Replit Agent** — Keep one application
  rather than introduce a frontend/backend package workspace solely for CI.
  **Why:** both surfaces ship as one Worker, and extra package boundaries would
  complicate the clean GitHub workflow the user requested without isolating a
  real service.
  **How to apply:** introduce another package only for a genuinely independent
  build/runtime unit, not to imitate a generic project template.

- **Registry portability · 2026-10-29 · Replit Agent** — Keep dependency metadata
  portable without overriding Replit's managed package registry.
  **Why:** GitHub runners cannot reach the internal package proxy; regenerating a
  lockfile over an existing dependency tree can also retain a retired workspace.
  **How to apply:** normalize generated tarball URLs only, preserve integrity
  hashes, and validate a fresh dependency tree when changing package boundaries.

- **D-012 · 2026-10-30 · user** — The GitHub repository `Cyberise0x1/WHATRDP` is
  **public**, and Cloudflare **Workers Paid ($5/mo)** is subscribed. Publication
  enables environments, environment secrets, deployment branch policies and
  required reviewers on the Free plan; `staging`/`production` environments and
  `main` branch protection (required "Repository checks") are now configured.
  **Why:** the private Free plan could not create environments/secrets or branch
  protection, and production required reviewers need a public repo (or Enterprise).
  **Consequence:** all tracked source and `.agents/memory/` are publicly visible; a
  secret-pattern scan of tracked files and git history found none, but the owner
  should still run a dedicated history scanner before treating publication as safe.

- **D-013 · 2026-10-30 · user** — Production Cloudflare resources are provisioned
  manually from a local session: D1 `whatrdp-production` (schema at 0001–0004) and
  Worker `whatrdp-production` on `*.workers.dev`, with no custom domain and no
  secrets. Repo variables now describe the production Worker/DB; the release
  workflow stays disabled (`ENABLE_PRODUCTION_DEPLOYMENTS=false`).
  **Why:** the account, token and resources were verified available and the owner
  approved Cloudflare work; provisioning here does not require a release.
  **Consequence:** production is schema-ready but cannot serve the catalogue until
  `RDP_MONSTER_API_TOKEN` is set, and it must not be treated as a release target
  until the `production` environment secrets, `PRODUCTION_POLICY_READ_TOKEN` and
  required-reviewer policy exist. DNS and `PRODUCTION_HOSTNAME` remain separate
  approvals; checkout and provisioning stay disabled.
  **How to apply:** never copy staging secrets into production without approval;
  record the previous Worker version before any future deploy.

- **D-014 · 2026-10-30 · user** — Production Worker secrets `RDP_MONSTER_API_TOKEN`
  and `APP_SECRET` were set by the owner in the Cloudflare dashboard (Secret type),
  after D-013 provisioned the resources. Values were never read back, printed or
  written to disk; Cloudflare secrets are write-only by design.
  **Why:** the supplier token could not be mapped programmatically — the API
  returns secret names only and no local or GitHub copy exists.
  **Consequence:** production now serves `/api/catalog` 200 and corrects the
  earlier `502 catalog_unavailable`; `/api/checkout` stays 503
  `payments_not_configured`. `APP_SECRET` is production-specific, which is safe
  because that database holds no encrypted records yet — preserve it from here on.
  **How to apply:** treat the dashboard as the only entry point for these values;
  future `wrangler deploy` runs retain existing secrets, so releases do not clear
  them.

- **D-015 · 2026-10-30 · user** — Production is released and public at
  `https://whatrdp.com`, deployed through **Deploy production** at `c6e4784`
  after the environment gate (required reviewer, typed `DEPLOY`,
  `PRODUCTION_POLICY_READ_TOKEN` with Administration read). The custom domain
  replaced the `*.workers.dev` route, which now returns 1042.
  **Why:** the owner approved the release path; the domain was the only missing
  piece for a public storefront.
  **Consequence:** hosting setup is not launch readiness — `POST /api/checkout`
  still returns 503 `payments_not_configured` because the route is hard-disabled,
  and `PROVISIONING_ENABLED` stays `false`. `www.whatrdp.com` has no record and
  does not resolve; only the apex is attached. The production `CLOUDFLARE_API_TOKEN`
  is the existing account-wide token, not the least-privilege credential this
  document asks for.
  **How to apply:** future production releases use the workflow only, never an
  ad-hoc `wrangler deploy`; add `www` (record or redirect) as a separate approved
  change; replacing the Cloudflare credential must not rotate away the account
  access the workflows depend on.

- **D-016 · 2026-10-30 · user** — The checkout path is wired end to end but
  remains closed: `POST /api/checkout` validates input, checks the live
  catalogue/OS, prices the plan, persists a `PENDING_PAYMENT` order, calls Zeno
  `createCheckout` and stores the checkout reference; `PlansGrid` posts to it.
  `CHECKOUT_AVAILABLE = false` in `src/lib/checkout-config.ts` keeps the route at
  503 and the buttons disabled.
  **Why:** the owner asked for the wiring, but a gateway must be verified against
  a real account before paid checkout is enabled, and the master switch must not
  be an environment variable that a deploy could flip.
  **Consequence:** enabling requires exactly three things — flip that constant,
  set `ZENO_API_KEY` (plus `ZENO_WEBHOOK_SECRET` for settlement), and take one
  end-to-end payment on staging. NGN is refused (`currency_not_supported`) until
  an FX source and quote cache are approved; no KV binding exists yet. A failed
  gateway call leaves an order with no payment reference, so it can never settle.
  **How to apply:** never create the order after the gateway call, never send a
  float to Zeno, and never let the client choose the amount.

- **D-017 · 2026-10-30 · user** — NGN is removed. Checkout, Zeno's
  `priceCurrency` and all product documentation are **USD-only**; any other
  currency is refused with `currency_not_supported` before an order exists.
  Supersedes the currency half of D-006.
  **Why:** the owner removed the dual-currency requirement, so no FX rate source
  or quote cache is needed and the earlier open question is closed.
  **Consequence:** `orders.charge_currency`/`charge_amount_minor`/`fx_rate` stay
  because `0003_charge_currency.sql` is applied and migrations are immutable; the
  claim guard still refuses to settle a differently charged legacy row. The
  applied migration's comment still mentions NGN — it is historical and must not
  be edited.
  **How to apply:** new checkout code writes USD only; do not reintroduce a
  currency selector without a new decision and an approved rate source.

- **D-018 · 2026-10-30 · user** — `CHECKOUT_AVAILABLE` is turned on (D-016 built
  it) so one real payment can be verified. `ZENO_API_KEY` is set on staging from
  the owner's existing secret; production keeps its own key and webhook secret.
  **Why:** the gateway must be proven with a real settlement before it can be
  trusted, and staging deploys automatically from `main`.
  **Consequence:** staging can create USD orders and hosted checkouts and will
  accept real money. Nothing provisions: `PROVISIONING_ENABLED` stays `false` and
  `provisionOrder` returns early for Cloudflare targets, so a paid staging order
  is recorded and stops at `PAID`. Production still runs the previous release, so
  `whatrdp.com` remains closed until a gated production release.
  **How to apply:** do not release production until Workflows/fulfilment and
  supplier funding exist, or a customer can pay and receive nothing; a staging
  payment is the owner's own money and should be treated as a test cost.

- **D-019 · 2026-10-31 · CommandCode** — Durable fulfilment is a Cloudflare
  Workflow exported from a custom Worker entry (`custom-worker.ts`), replacing
  the inline creation path. The Workflow claims intent before the billable
  `POST /servers`, runs creation with `retries.limit = 0`, and polls to `ACTIVE`.
  `GET /api/orders/[token]` is read-only; the Workflow is the only creation
  authority. It is implemented inert: `PROVISIONING_ENABLED` stays `false` in
  every environment, so no Workflow is dispatched and a paid order remains
  `PAID`. **Why:** D-008/D-011 require intent-before-billing and no automatic
  repeat; Workflows are the durable primitive, but enabling one must be a
  deliberate, reviewed change rather than a configuration toggle.
  **How to apply:** enabling requires editing `scripts/lib/deployment.ts` and
  its tests, then a funded staging end-to-end verification; never add a
  provisioning env override, and never re-introduce an inline creator.

- **D-020 · 2026-10-31 · CommandCode** — Stuck orders are reconciled by a
  five-minute scheduled handler in `custom-worker.ts` (bounded to 25 orders per
  run): re-dispatch the Workflow for old `PAID` orders only when
  `PROVISIONING_ENABLED=true`, re-sync `PROVISIONING` orders that have a linked
  service, and mark an interrupted claim without a service `REVIEW_REQUIRED`.
  Label reconciliation now walks every page (bounded at 10,000 servers) instead
  of reading page one. **Why:** at-least-once webhooks plus a lost Workflow
  dispatch must not leave a paid order indefinitely unfulfilled, and uncertainty
  must never trigger an automatic second `POST /servers`. **How to apply:** keep
  the run bounded, keep creation owned by the Workflow, and treat the cron
  schedule as deployment configuration under review.

- **D-021 · 2026-10-31 · CommandCode** — Checkout verifies the live supplier
  balance before persisting an order, requiring the plan's supplier cost plus
  `SUPPLIER_RESERVE_CENTS` (default 0, intended to be ~one month of renewals).
  A low balance returns 503 `insufficient_supplier_balance`; an unreadable
  account fails closed with `supplier_balance_unavailable`. The blocked path
  emits a credential-free `checkout_blocked_supplier_balance` log for alerting.
  **Why:** prepaid inventory must be funded before it sells, and taking money
  that cannot be provisioned is worse than refusing the sale. **How to apply:**
  set the reserve per environment; never remove the check to make a sale go
  through, and keep `402` from provisioning rather than retrying it.

- **D-022 · 2026-10-31 · user** — Order URLs stay **bearer credentials** for the
  controlled pilot: the unguessable token itself grants read access to the order
  and its revealed server credentials. No customer accounts before the pilot.
  `GET /api/orders/[token]` is read-only; responses and pages keep
  `private, no-store`, `Referrer-Policy: no-referrer` and `X-Robots-Tag: noindex`.
  The order page states that anyone with the link can view the credentials.
  **Why:** accounts are a large identity/session feature, and the owner chose the
  fastest safe path for a small controlled pilot. **Consequence:** a leaked or
  guessed link is the whole credential; tokens must never be logged, and accounts
  remain the required hardening before unrestricted public sales if the owner
  later changes this decision.

- **D-023 · 2026-10-31 · CommandCode (owner requested Turnstile)** — Abuse
  protection for checkout: a `CHECKOUT_RATE_LIMIT` binding (5 requests/60 s per
  client IP, separate staging/production namespaces, fail-open if absent) plus
  server-side Turnstile verification. Turnstile is config-gated: the public site
  key is a repository variable (`TURNSTILE_SITE_KEY`), the secret is a Worker
  secret (`TURNSTILE_SECRET_KEY`); with the secret set, checkout requires a valid
  token (403 `turnstile_required`/`turnstile_failed`). Webhooks are never
  challenged. **Why:** irreversible crypto payments need pre-payment screening,
  and the owner supplied the keys rather than accounts. **How to apply:** set
  both keys together before public sales, never paste the secret into source or
  chat, and keep limits off webhook routes.

- **D-024 · 2026-10-31 · user** — Production checkout stays closed through a
  server-side policy guard (`src/lib/checkout-policy.ts`):
  `checkoutEnabled()` returns false when `DEPLOYMENT_TARGET=cloudflare-production`,
  even though `CHECKOUT_AVAILABLE` is true and staging remains open. The page
  receives availability as a prop, so the browser never evaluates deployment
  variables. **Why:** production holds Zeno keys; funding the supplier balance
  would otherwise open real payments while provisioning is disabled, letting a
  customer pay and receive nothing (D-018). **How to apply:** remove the guard
  only in a reviewed change after fulfilment is enabled and one supplier order
  has been verified end to end; never expose production payments via config.

- **D-025 · 2026-10-31 · user (approved release)** — Production released at
  `66d7652` through the gated **Deploy production** workflow after reviewer
  approval (run 41202982687, checks and deploy green). Verified live on
  `whatrdp.com`: root and catalogue 200, Turnstile widget and site key rendered,
  and `POST /api/checkout` 503 `payments_not_configured` via the D-024 guard.
  Worker secrets retained, including `TURNSTILE_SECRET_KEY`. Fulfilment stays
  disabled. **Why:** the owner chose browse-only production while funding and
  reseller products are pending. **How to apply:** keep production checkout
  closed until provisioning is enabled and one supplier order is verified end to
  end; future releases use the workflow only, never an ad-hoc deploy.

- **D-026 · 2026-10-31 · CommandCode** — Fulfilment enablement is a
  per-environment reviewed switch, `FULFILMENT_ENABLED` in
  `scripts/lib/deployment.ts`. Both environments remain `false`; staging is
  enabled first after funding and reseller products exist, and production only
  in the reviewed change that removes the D-024 guard.
  **Why:** a global flip would arm production's five-minute reconcile cron and
  could bill the supplier for any pre-existing `PAID` order as soon as staging
  was enabled. **How to apply:** activation is a one-line map change plus the
  current-state test update; never add an environment override, and never
  enable production before one staging order is verified end to end.

- **D-027 · 2026-10-31 · CommandCode** — D1 backups are a scheduled GitHub
  Actions workflow (`Backup D1 to R2`, daily 03:17 UTC) driving the pinned
  `wrangler`: export both databases, verify size/checksum/required tables, then
  upload the dump and a row-count manifest to private `whatrdp-backups-*`
  buckets under a 35-day `d1/` lifecycle. A restore drill imports into a
  disposable D1 and fails only when a table is missing or smaller than the
  export snapshot.
  **Why:** the export API and multi-GB body are a poor fit for a Worker cron,
  and backups must not depend on a production-environment reviewer.
  **How to apply:** keep the buckets private and `BACKUP_CLOUDFLARE_API_TOKEN`
  dedicated; never attach a dump to a GitHub artifact; the workflow cannot run
  until R2 is enabled on the account and the two buckets/secrets exist.

- **D-028 · 2026-11-01 · CommandCode** — Operational monitoring is built in:
  every alert is a structured `operational_alert` log line, and the optional
  Worker secret `ALERT_WEBHOOK_URL` delivers the same payload to Slack, Discord,
  Telegram (`chat_id` query) or any JSON endpoint. Delivery is best-effort via
  `ctx.waitUntil` with a three-second timeout and a per-code cooldown; it never
  blocks or fails a request, and sensitive keys, emails and secret prefixes are
  scrubbed. Coverage: supplier `401/403`, `402`, `5xx`, unreachable; catalogue,
  checkout and gateway failures; provisioning `FAILED`/`REVIEW_REQUIRED` and
  dispatch/reconcile failures; webhook secret, payload, unmatched/mismatched
  payment and processing failures; stale backups.
  **Why:** the failure modes that cost money or silently stop fulfilment must be
  visible without adding a vendor. Invalid signatures are not alerted because
  anyone can POST them; they are rejected with `401`.
  **How to apply:** set `ALERT_WEBHOOK_URL` per environment as a Worker secret;
  without it alerts stay in Workers Logs. Never put customer data, order tokens
  or credentials in alert context.

- **D-029 · 2026-11-01 · CommandCode** — Backup freshness uses a D1 heartbeat
  instead of giving the Worker R2 access: the backup workflow inserts into
  `backup_heartbeat` only after the dump and manifest uploads succeed, and the
  five-minute Worker cron raises `backup_stale` when the latest row is missing or
  older than 26 hours. A failed heartbeat insert is logged but does not fail the
  backup: a monitoring failure must not stop the thing it monitors, and the
  Worker alerts because the heartbeat stops moving.
  **Why:** the request-serving Worker must not gain read/write access to dumps
  that contain order tokens and customer data, and listing R2 needs credentials
  it does not have. **How to apply:** apply
  `migrations/0005_backup_heartbeat.sql` before the next scheduled backup; never
  write the heartbeat before both uploads.

- **D-030 · 2026-11-01 · CommandCode** — Supplier webhook events are classified
  in `src/lib/supplier-events.ts`: lifecycle events (`server.created`,
  `server.delivered`, `server.renewed`, `server.suspended`, `server.deleted`)
  trigger an authoritative resync, `service.expiring` flags the order, invoices
  (`invoice.created`, `invoice.paid`) are acknowledged without touching an
  order, `payment.failed` raises the critical `supplier_payment_failed` alert,
  and unknown events are acknowledged and ignored. Signature verification
  accepts `v1=<hex>` over `timestamp.body`, a bare hex signature, and a
  `whsec_…` secret used either as displayed or base64-decoded.
  **Why:** delivery is at-least-once, so an unrecognised event must not answer
  `5xx` and invite retries; billing events have no order row to update, and a
  failed supplier payment needs a human. The newer webhook API shows the secret
  in Standard Webhooks form, and rejecting every delivery because of a display
  format would silently stop fulfilment. All accepted candidates are still an
  HMAC of the same timestamp and raw body with the configured secret, compared
  in constant time.
  **How to apply:** add new events to `supplier-events.ts`, not to the route;
  never accept a signature format that is not derived from the configured
  secret; invalid signatures stay a `401` without an alert.

- **D-031 · 2026-11-01 · user (provider and content), CommandCode (delivery
  policy)** — Credentials are emailed when an order becomes `ACTIVE`, using the
  Cloudflare Email Service `send_email` binding (`EMAIL`) with no API key or
  npm dependency. Checkout now requires an email address. The message contains
  the IP, username, password, plan and order link (owner chose full credentials
  over a link-only message). Delivery is claimed in D1 before sending and marked
  after success; the Workflow sends once, and the five-minute cron sweeps orders
  whose credentials were stored by the request path, retrying at most three
  times 15 minutes apart. An absent sender/binding raises
  `email_not_configured` and never consumes an attempt; failed attempts raise
  `credentials_email_failed`, and the third raises `credentials_email_exhausted`.
  **Why:** fulfilment must not depend on a notification, and sending is not
  billable, so a bounded at-least-once retry is preferable to a lost password.
  A crash between send and mark can duplicate one email, which is preferable to
  silence.
  **How to apply:** onboard `whatrdp.com` in Email Service with SPF/DKIM/DMARC,
  set `EMAIL_FROM` and the per-environment `*_PUBLIC_BASE_URL`, and apply
  `0006_credentials_email.sql` before the next release. Never log the address,
  password or message body; keep the order page as the durable fallback.

- **D-032 · 2026-11-02 · CommandCode (owner-approved enablement)** — Production
  checkout and fulfilment are enabled in one reviewed change:
  `FULFILMENT_ENABLED.production = true` in `scripts/lib/deployment.ts` and the
  D-024 target guard removed from `src/lib/checkout-policy.ts`, so
  `checkoutEnabled()` follows `CHECKOUT_AVAILABLE` in every environment.
  Preconditions verified read-only: staging order 4 ($15.99 USDC) reached
  `ACTIVE` and its credential email was received; production has
  `ZENO_API_KEY`, `ZENO_WEBHOOK_SECRET`, `TURNSTILE_SECRET_KEY`, the email
  binding and sender, and migrations 0001–0006 applied; production `orders` is
  empty, so arming the five-minute reconcile cannot dispatch a pre-existing
  `PAID` order.
  **Why:** the owner approved enablement after receiving the staging credential
  email, and D-024/D-026 require this exact reviewed change rather than a
  configuration toggle.
  **Consequence:** the next gated **Deploy production** release opens real
  payments and arms the production Workflow and reconcile cron; the currently
  deployed Worker stays closed until that run.
  **How to apply:** release only through the production workflow, record the
  previous Worker version (`0dbeb585`) for rollback, and keep the supplier
  balance funded; never add an environment override for checkout or fulfilment.

- **D-033 · 2026-11-02 · user (approved release), CommandCode (delivery)** —
  Production was released at `0046808` through the gated **Deploy production**
  workflow (run 41512943722, checks and deploy green after reviewer approval) as
  Worker version `2b821f4f-0532-4677-bac0-d979699ae8e7`. Live verification: root
  and `/api/catalog` return 200, an unknown order returns 404, and
  `POST /api/checkout` with an empty body returns 400 `invalid_sku` (checkout
  open and gateway configured) without creating an order. Production Worker
  bindings confirm `DEPLOYMENT_TARGET=cloudflare-production` and
  `PROVISIONING_ENABLED=true`; production `orders` remains empty. The previous
  Worker version is `0dbeb585-6e9e-4c67-b0cc-e305bb69b1da` for rollback.
  **Why:** the owner approved the release after the reviewed D-032 change and
  the required-reviewer gate.
  **Consequence:** production accepts real Zeno payments, and a settled order
  dispatches the provisioning Workflow and the five-minute reconcile cron. No
  production order has been placed yet.
  **How to apply:** monitor the first real order end to end; a Worker rollback
  does not reverse D1 writes or supplier orders, so reconcile those explicitly.
  Keep release authority in the workflow.

- **D-034 · 2026-11-02 · CommandCode** — A supplier `404` for a linked service is
  authoritative deletion, not a transient error. Both `syncOrder` (supplier
  webhook and order-page refresh) and the five-minute reconciliation mark the
  order `CANCELLED`, clear the stored IP, username and encrypted password, and
  record a non-retryable message. Non-404 read failures keep the current status
  and remain retryable. The order page hides credentials because it only reveals
  them for `ACTIVE` orders.
  **Why:** a cancelled or deleted server must not leave an `ACTIVE` order
  showing credentials that no longer work; a `5xx` or timeout is not proof of
  deletion and must not cancel a live server.
  **How to apply:** only a `404` maps to cancellation; never treat a transient
  supplier failure as deletion. The staging test server for order 4 is set to
  cancel at period end (`autoRenew=false`, expires 2026-12-02), not destroyed
  immediately.

- **D-035 · 2026-11-02 · CommandCode** — The cancellation handling fix was
  released to production at `8b35299` through the gated **Deploy production**
  workflow (run 41522474918, checks and deploy green after reviewer approval) as
  Worker version `1d6d2b4e-d46d-4b5f-a7de-26e7a793ab62`. Production remains
  `DEPLOYMENT_TARGET=cloudflare-production` with `PROVISIONING_ENABLED=true`;
  live checks pass and production `orders` is still empty. The previous Worker
  version is `2b821f4f-0532-4677-bac0-d979699ae8e7` for rollback.
  **Why:** the staging test server was set to cancel at period end, and leaving
  an ACTIVE order with stale credentials is a launch gap.
  **Consequence:** a supplier `404` now cancels the order and clears credentials;
  the first real production order still needs end-to-end monitoring.
  **How to apply:** keep the 404 rule for deletion and never cancel on a
  transient failure.

- **D-036 · 2026-11-02 · CommandCode** — `www.whatrdp.com` now resolves through
  a proxied CNAME to `whatrdp.com`, and a zone-level Single Redirect rule returns
  301 to `https://whatrdp.com` with path and query preserved. No Worker custom
  domain or application change is required; the redirect happens at the edge
  before the Worker.
  **Why:** close the `www` launch gap without duplicating the app or changing
  code.
  **How to apply:** keep the redirect rule; if the apex hostname ever changes,
  update the rule target.

- **D-037 · 2026-11-04 · user** — Customer-facing surfaces no longer name the
  upstream infrastructure provider. WHATRDP is presented as an anonymous-first
  service and a Cyberise project (`https://cyberise.org`); the legal pages refer
  to “our infrastructure provider”. Added `/anonymous-vps`, a home privacy
  section, and EU/US location plus Standard/High-performance catalogue controls.
  **Why:** the owner wants the storefront positioned around anonymity and does
  not want customers to identify the reseller relationship.
  **Consequence:** public copy, emails, public API errors and order errors are
  provider-neutral; internal source, docs, tests and git history still name the
  provider, so the public repository can reveal it. Legal entity/contact
  placeholders remain, and generic recipient wording still needs counsel review.
  **How to apply:** never add the provider name to customer-facing copy, email,
  public API errors or order errors; keep operator alerts specific, and keep the
  legal description generic unless counsel directs otherwise.

- **D-038 · 2026-11-04 · user (approved staging release), CommandCode (delivery)** —
  The storefront redesign and anonymous positioning were released to Cloudflare
  staging. The first push (`651ddef`) failed GitHub `npm ci` because the gsap
  entries still used Replit-internal registry URLs; the normalizer changed only
  those two URLs, and `6cd1537` passed CI run 41820450271 and the automatic
  **Deploy staging** run 41820714719 as Worker version
  `651e378a-b6d8-4da3-a880-cdce7b5813dc`. Live staging checks: `/`,
  `/anonymous-vps`, all four legal pages and `/api/catalog` return 200; customer
  copy contains no provider name; production remains on `8b35299` (Worker
  `1d6d2b4e-...`) because no production workflow was run.
  **Why:** the owner asked for the newest storefront on staging for review.
  **Consequence:** staging is anonymous-first; the release-record commit that
  adds this entry triggers a second identical staging deploy.
  **How to apply:** production still requires the gated **Deploy production**
  workflow and explicit owner approval; never count a staging release as a
  production release.

- **D-039 · 2026-11-04 · user (requested), CommandCode (delivery)** — The
  customer order console gains live power controls for `ACTIVE` orders: start,
  reboot, graceful shutdown and force-off, plus a manual status refresh. A new
  `POST /api/orders/[token]/actions` endpoint accepts only those four actions
  and calls the supplier's `POST /servers/{id}/actions`; non-`ACTIVE` orders are
  refused. `?sync=1` on the read endpoint is the only way the panel asks for a
  fresh supplier power state; the default read path stays local. This extends
  D-022: the bearer link now grants control as well as read access. Delete,
  reinstall, rescue, console, renew/cancel and password reset stay unexposed.
  **Why:** the owner asked for parity with the provider's customer panel; the
  supplier's `vps:write` scope already covers these power actions.
  **How to apply:** keep the allowlist server-side, require inline confirmation
  for reboot/shutdown/force-off, and never add a destructive or billable action
  without a new review. Do not log tokens, credentials or supplier action
  bodies.

- **D-040 · 2026-11-04 · CommandCode** — Power controls are hardened before
  release: `0007_power_control.sql` adds nullable `orders.power_state` and
  `orders.power_checked_at` plus a `power_actions` audit table. One accepted
  action per order is claimed by a single atomic D1 insert per 10-second window
  before the supplier call; the row records `requested`/`sent`/`rejected`/
  `failed`/`server_missing`/`rate_limited` and never credentials. `?sync=1`
  returns the cached power state when `power_checked_at` is under 10 seconds old,
  so a panel load costs at most one supplier `GET` per order per window.
  **Why:** a bearer link should not be able to hammer the supplier, and operators
  need a durable record of who did what to which server; the cache also bounds
  panel-driven supplier reads as traffic grows.
  **How to apply:** apply migration 0007 to staging and production before the
  release that includes power controls; never bypass the D1 claim for a supplier
  power call, and keep audit rows free of tokens, credentials and customer
  contact data.

- **D-041 · 2026-11-04 · user (approved), CommandCode (delivery)** — The power
  controls and audit/throttle migration were released to production at
  `ec045fd` through the gated **Deploy production** workflow (run `41920841164`;
  checks and deploy green after required-reviewer approval) as Worker version
  `43459514-8145-4f63-8e16-0b6f83a52637`. `0007_power_control.sql` was applied
  to staging and production first and verified (`power_state`,
  `power_checked_at`, `power_actions`). Live checks: `whatrdp.com` and
  `/api/catalog` return 200; an unknown order token on the new action route
  returns JSON 404. Production orders at release: 3 `PENDING_PAYMENT`, 1
  `FAILED`, 0 `ACTIVE` with a linked service, so no customer panel currently
  exposes power controls; they appear when an order reaches `ACTIVE`. The
  previous production Worker version is
  `1d6d2b4e-d46d-4b5f-a7de-26e7a793ab62` for rollback. No power action was fired
  against a live server.
  **Why:** the owner approved the production move after staging verification.
  **Consequence:** production now runs the power-control code and schema; a
  Worker rollback does not reverse the additive migration, which is safe.
  **How to apply:** verify the first `ACTIVE` production order shows the power
  panel; keep 0007 applied and never bypass the reviewer gate on future
  releases.
