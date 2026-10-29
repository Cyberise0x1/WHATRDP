# Memory index

> **Authoritative source:** [`decisions.md`](decisions.md). This index is only a
> map. If an older note disagrees with `decisions.md`, `decisions.md` wins.

- [Decisions](decisions.md) — append-only, dated, authoritative. **Read first.**
- [Current state](current-state.md) — done / in progress / blocked, per agent.
- [Ownership](ownership.md) — path claims and leases. Claim before editing.
- [Reseller launch scope](reseller-launch-scope.md) — target market (Nigeria +
  international) and NGN/USD checkout. Its caveat about WHMCS and payment
  providers is **superseded** by D-003 and D-004.
- Journals: `.agents/journal/YYYY-MM-DD-<agent>.md` — append-only session log.

## Quick facts

- Inventory is resold from rdp.monster; we host no servers.
- App: Next.js on Cloudflare Workers + D1. No WHMCS.
- Payments: crypto only via Zeno Bank, BYO wallet, NGN + USD.
- `HOSTING-CHOICE.md` is superseded history.
