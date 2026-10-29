# Repository instructions

Read `README.md`, the relevant files under `docs/`, and
`.agents/memory/decisions.md` before changing application behavior. Historical
decisions are append-only; older path references may be stale after relocation.
The current repository tree and later decisions take precedence over old
implementation notes.

## Scope

- One root-level Next.js app on Cloudflare Workers/OpenNext and D1.
- Provider-managed RDP inventory; this app does not host the virtual machines.
- Zeno is the selected future gateway; no gateway is implemented at present.
- The product must eventually support NGN and USD; current catalogue prices are USD.
- Checkout stays disabled until a verified gateway is deliberately implemented.
- Persist provisioning intent before any billable supplier request. An uncertain
  result must never trigger an automatic repeat.

## Working together

Check the working tree for other agents' edits and coordinate an exclusive window
before editing the same paths, particularly payments, storage and migrations.
Never revert someone else's work. Local coordination journals may live under
`.agents/journal/`, but are not shipped to GitHub. Project tasks are the live work
queue; do not create duplicate task/status files.

Keep UI, server integrations and persistence separated. Update callers and tests
when changing an interface. Reuse the existing repository and atomic claims.
Never edit an already-applied migration: add a forward migration and document the
compatibility/rollback implications.

## Safety and verification

No publishing, DNS change, remote resource creation, real data migration, paid
order or credential rotation without explicit approval. Do not inspect or print
secret values. Tests use dummy credentials, disposable databases and intercepted
HTTP only. Never deploy the test SQL fixture wrapper.

Run `npm run ci` before delivering changes. Check the running preview for UI
changes. Do not claim GitHub checks, cloud deployment or real settlement worked
unless those external checks actually ran. Keep documentation accurate about
disabled and unfinished features.
