# RDP.monster storefront

A single Next.js/TypeScript application for reselling provider-managed remote
servers. The website and API target Cloudflare Workers through OpenNext, with D1
for production storage. The actual servers remain with RDP.monster.

**Not ready for paid launch.** Catalogue browsing and existing order views work,
but checkout is deliberately disabled. The selected Zeno integration, customer
accounts and durable fulfilment are separate work. No deployment is enabled by
default.

## Local development

Use Node **22.23.4** and npm **10.9.9**. From a fresh checkout:

```sh
npm ci
npm run dev
```

The app listens on port 5000. Without supplier configuration it renders an
explicit catalogue-unavailable state, not invented stock. The runtime expects
`RDP_MONSTER_API_TOKEN`; the creator's existing `RDP_MONSTER_API_KEY` must be mapped
to that name through approved secret configuration. Never paste actual values
into source or chat. See `.env.example` for non-secret configuration names.

```sh
npm run lint
npm run format:check
npm run typecheck
npm run test:unit
npm run build                 # Ordinary Node build
npm run cf:build              # Local OpenNext build; does not publish
npm run test:integration      # Requires cf:build first
npm run cf:bundle:check       # Normal release packaging, dry-run only
npm run ci                   # All checks in the correct order
npm run cf:preview            # Local Workers preview on port 5000
```

For a **new disposable local** D1 database only:

```sh
CI=1 npx --no-install wrangler d1 migrations apply DB --local
```

Node development uses the current SQLite schema. Existing database files were
not moved or converted by repository cleanup. If an old local database is
detected, the driver stops with migration instructions rather than silently
creating a replacement. Preserve `APP_SECRET` for existing encrypted credentials.

## Repository

```text
src/                 Next.js app, UI components and server business logic
migrations/          Immutable baseline and reviewed forward migrations
scripts/             Offline export, packaging and deployment safety checks
tests/unit/          Local storage, retry and deployment-policy tests
tests/integration/   Actual packaged Worker with isolated D1 and mocked egress
tests/fixtures/      Test-only Worker wrapper; NEVER deploy this
docs/                Product, architecture, tests, security and deployment
.github/workflows/   Credential-free CI and disabled-by-default CD
```

There is one package manifest and one lockfile, not a frontend/backend monorepo.
The former `storefront/` directory, if present locally, contains ignored original
state only and is not part of the distributable repository.

## GitHub and Cloudflare

Pull requests and main-branch pushes run **CI / Repository checks**. Staging
deployment requires explicit enablement and a successful trusted main-branch
check. Production requires a manual main-branch release, successful checks and a
protected environment with required reviewers. Cloudflare credentials are never
available to pull-request tests.

See [deployment setup](docs/DEPLOYMENT.md). Workflow files are prepared; no GitHub
repository was pushed, remote CI run, Cloudflare resource created, or app
published as part of this cleanup.

## Documentation

- [Product scope and remaining launch work](docs/PRODUCT.md)
- [Architecture and data compatibility](docs/ARCHITECTURE.md)
- [Development and dependency updates](docs/DEVELOPMENT.md)
- [Test plan](docs/TEST_PLAN.md)
- [Security boundaries](docs/SECURITY.md)
- [Deployment, migrations and rollback](docs/DEPLOYMENT.md)
- [Cleanup inventory](docs/REPOSITORY-CLEANUP.md)
- [Historical decisions](.agents/memory/decisions.md)
