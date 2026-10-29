# Test plan

## Automated local/CI checks

`npm run ci` runs format/lint, type checks, unit tests, the ordinary Next build,
the OpenNext build, integration tests and normal release-bundle inspection.

Unit tests cover safe API retry limits, isolated Node/SQLite behavior, historical
reference export, immutable source bytes, migration compatibility, environment
binding guards, required-reviewer policy and workflow YAML/pinned action checks.

Production-policy tests inject dummy read-only API responses: required reviewers
allow the check; missing credentials, wrong event/branch, denied API access,
malformed responses and missing reviewer rules stop it. Workflow assertions
require the protected policy-secret mapping, never the default Actions token.
These tests do not authenticate to or validate a real GitHub environment.

Integration tests package a **test-only** Worker through Wrangler dry-run and
execute actual Next.js handlers in workerd/Miniflare with native D1. They cover:

- Server-rendered catalogue and catalogue API.
- Explicitly disabled checkout, with no order creation or gateway/supplier egress.
- Internal payment amount/currency/ownership/settlement checks and duplicate claims.
- Parallel creation claims, interrupted claims and ambiguous upstream outcomes.
- Provider signature tampering/stale timestamp rejection and authoritative sync.
- Cross-runtime encrypted credential compatibility, no-store and unknown links.
- Offline export/import round-trip with original IDs/ciphertext.
- Rendered disabled purchase controls and their customer-facing explanation.

All credentials are dummy values. Unknown HTTP egress fails. No test may use a
real account, settle a payment or spend supplier credit. The SQL bridge exists
only in the test fixture entry point, never the normal Worker.

## Packaging and workflow verification

`cf:bundle:check` inspects the normal Wrangler release package for accidental SQL
fixtures, native SQLite imports or retired gateway dependencies. Workflows use
pinned action commits, read-only PR permissions and no inherited secrets.
The release jobs validate configured resources and reject missing approvals.

## Manual review and external boundaries

Check desktop/mobile landing states, catalogue selectors and unavailable purchase
controls, plus invalid order links. Existing-order account authorization is a
known missing launch feature; do not claim it is covered.

Remote GitHub runs, Cloudflare network access, real callback delivery, Zeno
settlement, supplier creation, load testing and production restore/cutover
require separate approved checks. Local tests are not proof those external
systems work or a complete security audit.
