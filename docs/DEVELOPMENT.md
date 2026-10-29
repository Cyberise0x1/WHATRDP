# Development

## Tools and commands

Use the versions in `.node-version` and `package.json`: Node 22.23.4 and npm
10.9.9. Install with `npm ci`. See the root README for commands and their order.
Use `npm run format`, then lint/type-check and the relevant tests while editing;
run `npm run ci` once the complete change is ready.

No application, dependency manifest, runtime config or migration lives under
`storefront/` any longer. Do not run package commands from that old local-state
directory. Replit's managed preview runs `npm run cf:preview` at the root.

## Dependencies

Runtime dependencies are Next and React. TypeScript, OpenNext, Wrangler,
Miniflare, lint/format/test tools are development dependencies. Commit the one
root lockfile. Use the supported package manager flow for dependency updates,
then run `npm run lockfile:normalize` and the full checks.

Normalization only makes generated npm tarball URLs portable to GitHub. It does
not alter integrity hashes or override the environment's configured registry.
Inside Replit, npm continues using the managed registry. Do not change registry
settings to bypass package security checks.

## Style and contribution

- TypeScript with focused modules; keep the current structure unless justified.
- ESLint enforces unused-variable and React hook rules; Prettier defines format.
- Reuse existing components. Do not add empty architectural folders.
- Write regression tests for behavior changes, including failure/duplicate cases.
- Keep commits coherent and avoid unrelated mass refactors.
- Use pull requests; require the `Repository checks` job before merging main.
- Keep application secrets out of tests, Git, examples, logs and artifacts.

## Context

`AGENTS.md` is the shared coding rulebook. Historical business/technical decisions
remain in `.agents/memory/decisions.md`; do not duplicate their content into a
new decision tracker. The project task queue is the current work list. Local
agent journals, settings and transcripts are not distributable project context.

The supplied [beginner-to-production guide](https://docs.google.com/document/u/0/d/12u0wXE0u0o5FNGj2sGy8OvOPHEtPSwD8ltwN0UcvqH4/mobilebasic?pli=1)
informed the documentation/check/preview workflow, not a switch to its example
database or hosting provider.
