# Ownership

Prevents two agents editing the same files at once. **Append only** — release by
adding a row, never by deleting or editing an earlier row.

Lease default: 90 minutes. Renew by appending a new row for the same scope.

| Paths | Agent | Status | Claimed (UTC) | Expires (UTC) | Note |
| --- | --- | --- | --- | --- | --- |
| `storefront/**`, `tests/**`, root `package.json` | Replit Agent | ACTIVE | 2026-10-29 14:24 | 2026-10-29 16:00 | Workers/D1 port + tests |
| `storefront/src/lib/payments.ts`, `storefront/migrations/**` | CommandCode | QUEUED | — | — | Zeno swap, only after the row above is RELEASED |
| `*.md` at repo root, `.agents/memory/**` | CommandCode | ACTIVE | 2026-10-29 15:10 | 2026-10-29 16:40 | Docs + shared memory. Append-only files are shared. |

## Rules

- A **QUEUED** row is not permission. Wait for the blocking row to be RELEASED.
- Overlapping paths with an ACTIVE, unexpired claim: do not edit. Work
  elsewhere, or say so to the user.
- Append-only files (`decisions.md`, `ownership.md`, journals) are exempt from
  path locks — append, never rewrite.
- If you must touch a path outside your claim, add a row first.
