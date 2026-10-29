# AGENTS.md — shared operating memory

Two coding agents work in this repository at the same time, on one filesystem:

- **CommandCode** — runs in the Replit shell
- **Replit Agent** — runs in the Replit workspace

They share one memory. Read this file before anything else.

---

## Read order, every session

1. `AGENTS.md` (this file)
2. `.agents/memory/decisions.md` — authoritative, append-only
3. `.agents/memory/current-state.md` — done / in progress / blocked
4. `.agents/memory/ownership.md` — who is editing what right now
5. `.agents/journal/` — the other agent's latest entry

## What wins when sources disagree

| Question | Source of truth |
| --- | --- |
| What the code actually does | the code and `tests/` |
| What we intend to build | `.agents/memory/decisions.md` |
| What is happening right now | `current-state.md` + `ownership.md` |
| Historical reasoning | `.agents/journal/`, `WORKLOG.md` |

If code and `decisions.md` disagree, **stop and log it**. Do not guess and do
not silently "fix" it.

`HOSTING-CHOICE.md` is superseded (WHMCS is not used). It is history only.

## At a glance

- We resell rdp.monster inventory through their API. **We do not host servers.**
- The app is a custom Next.js storefront on **Cloudflare Workers + D1**.
- **No WHMCS.**
- Payments are **crypto only, via Zeno Bank**. Stripe is being removed.
- Checkout must support **NGN and USD**.
- Provisioning never auto-retries an uncertain `POST /servers`.

`decisions.md` is the authority for all of the above; this list is a convenience.

## Rules

1. **Claim before editing.** Add a row to `ownership.md` for the paths you are
   about to touch. Release it when done.
2. **Append only** to `decisions.md`, `ownership.md`, and `.agents/journal/`.
   Never rewrite, reorder, or delete another agent's entries.
3. **`current-state.md` is sectioned by agent.** Edit only your own block.
4. **Never revert another agent's work.** If it blocks you, write it in your
   journal and say so to the user.
5. **No secrets in files.** Keys live in Replit Secrets or `wrangler secret put`.
6. **No deploy, no data migration, no destructive command** without explicit
   user approval.
7. **One journal file per agent per day**: `.agents/journal/YYYY-MM-DD-<agent>.md`.

## Handoff format

When you stop, append this to your journal:

```
### Handoff <UTC timestamp>
Changed:   <paths>
Verified:  <tests / commands actually run>
Not done:  <what remains>
Blocked by:<agent, key, approval, upstream state>
Next:      <the single next action>
```

Then update your block in `current-state.md` and release your ownership claims.

## Copy-paste prompt

`AGENTS-PROMPT.md` contains the session-start prompt for either agent.
