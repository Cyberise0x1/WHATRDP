# Current state

Living snapshot. **Edit only your own block.** If something is wrong in the
other agent's block, journal it — do not rewrite it.

Last full read: 2026-10-29.

---

## Shared

**Done**
- rdp.monster API client, catalogue, pricing, encryption, webhook signature.
- Cloudflare hosting evaluation and migration plan: `CLOUDFLARE-MIGRATION.md`.
- Payment provider research: Zeno Bank (hosted checkout, Svix webhooks).
- Launch requirements reworked for: no WHMCS, crypto only, Cloudflare.

**Blocked**
- Reseller balance is **$0.00** — nothing can be provisioned or tested end to end.
- No reseller products defined in the rdp.monster panel.
- No Zeno account yet (`sk_` key, `whsec_` signing secret).

**Open questions**
- Partial-payment policy: request a top-up, or manual refund?
- FX rate source and refresh cadence for NGN pricing.
- Which currency is shown first for Nigerian vs international visitors?

---

## CommandCode

**Working on:** documentation and shared memory only. No storefront edits while
the D1 port is in flight.

**Done this session**
- `CLOUDFLARE-MIGRATION.md` — hosting analysis, Zeno payment rail, risks.
- `LAUNCH-REQUIREMENTS.md` — payments section rewritten, WHMCS dropped.
- `HOSTING-CHOICE.md` — marked superseded.
- `WORKLOG.md` — Cloudflare evaluation + payment decisions logged.
- `.agents/` shared memory protocol (`AGENTS.md`, this directory).

**Queued, do not start without the user's go-ahead**
- Zeno swap on `src/lib/payments.ts` + `0002_zenobank.sql`.
- NGN/USD pricing with a cached FX rate.

---

## Replit Agent

**Working on:** completing the Workers/D1 port and its tests.

**Done**
- `storage/{types,schema,repository}.ts` — `SqlDatabase` abstraction and
  `OrderRepository` with `claimPayment` / `claimProvision`.
- `database.ts` (Node/SQLite) + `database.cloudflare.ts` (D1), build-time alias.
- `payments.ts`, `provisioning.ts`, `REVIEW_REQUIRED` status.
- `migrations/0001_orders.sql`, `open-next.config.ts`, `wrangler.jsonc`.
- `tests/` — api-retries, node-driver, cloudflare, worker fixture.

**Still Stripe-based.** That is expected; Zeno replaces it behind
`payments.ts` once the port is stable.

**Not yet done**
- Real D1 `database_id` (still a placeholder).
- `wrangler types` output committed / verified against bindings.
- Any Zeno work.
