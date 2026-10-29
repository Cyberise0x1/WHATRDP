# Cloudflare compatibility validation

The original compatibility proof established that the existing Next.js 15 app
can run through OpenNext on Workers with native D1 rather than native SQLite.
The repository has since been flattened and its unused payment integration
removed; current commands and behavior are described in the root README.

## Retained decisions

- Stay on the supported Next.js 15/OpenNext path instead of adopting a beta
  framework/major-version migration solely to change hosting.
- Validate the final Wrangler-packaged artifact in workerd, not just Next output.
- Keep Node/SQLite for isolated local development; D1 for Cloudflare.
- Preserve the encryption format/key and atomic payment/provisioning claims.
- Never retry uncertain billable creation; keep public checkout disabled.

The compatibility date remains pinned to `2026-07-01`, supported by the installed
Wrangler/workerd versions. Raising it requires a fresh runtime check.

## Current evidence and limits

The regression suite exercises real packaged Next routes and native emulator D1,
using intercepted provider requests and disposable fixtures. Both ordinary Node
and Cloudflare builds and the normal-release fixture-exclusion check are part
of `npm run ci`. See [the test plan](TEST_PLAN.md).

No Cloudflare account/network route, production database or live payment was
validated by local emulation. Supplier IP allowlisting, remote callbacks,
settlement, load limits, background reconciliation and restore/cutover remain
separate approval-gated checks.

Workers Paid has a usage-based cost floor, not a guaranteed total monthly bill.
Recheck official Worker/D1/Workflows/storage pricing for the chosen account before
approving resources; supplier credit, gateway fees, domains and support are
separate costs.

See [deployment](DEPLOYMENT.md), [architecture](ARCHITECTURE.md) and
[security](SECURITY.md) for the current operational boundaries.
