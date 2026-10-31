# D1 backups and restore drill

Status: buckets, lifecycle rules, repository secrets and the first
staging/production backups exist. The restore drill passed on 2026-10-31. The
scheduled workflow starts after this change merges to `main`.

## What is backed up, where

A scheduled GitHub Actions workflow (`Backup D1 to R2`, daily at **03:17 UTC**)
exports both databases with the pinned `wrangler` and uploads each dump to a
private R2 bucket.

| Environment | Database (repository variable)     | Private bucket               |
| ----------- | ---------------------------------- | ---------------------------- |
| staging     | `vars.STAGING_D1_DATABASE_NAME`    | `whatrdp-backups-staging`    |
| production  | `vars.PRODUCTION_D1_DATABASE_NAME` | `whatrdp-backups-production` |

Each run writes two objects under the `d1/` prefix:

```text
d1/<environment>/<YYYYMMDDTHHMMSSZ>.sql
d1/<environment>/<YYYYMMDDTHHMMSSZ>.manifest.json
```

The lifecycle rule `d1-retention-35d` expires both after **35 days**. Time
Travel remains available for point-in-time recovery, but it is not a backup and
is not a restore test.

## Integrity rules

- The export is verified **before** any upload: file is non-empty, SHA-256 is
  computed, and the required tables (`orders`, `webhook_events`,
  `d1_migrations`) must appear in the schema. A failed or truncated export never
  replaces a good backup.
- The manifest records the environment, database, export time, object keys,
  SHA-256, byte size and row counts taken at export start.
- A restore is accepted when every table is present and no table has **fewer**
  rows than the manifest. More rows is allowed because writes can land between
  the count query and the export snapshot.
- Workflow logs print only the object key, size, checksum and counts — never SQL
  contents or credentials. There is no GitHub artifact upload.

## Known limitations

- Remote `wrangler d1 export` can make the database unavailable to serve queries
  while it runs. It is scheduled off-peak with a 60-minute job timeout;
  re-evaluate if export duration grows.
- GitHub pauses scheduled workflows after 60 days of repository inactivity.
  Backup freshness monitoring is part of the P2 monitoring work.
- Retention is 35 daily copies. Longer retention (for example monthly archives)
  would be a separate reviewed change.

## One-time setup (approval required)

Completed on 2026-10-31: both buckets, the lifecycle rules and the two
repository secrets exist. The commands below remain for reproduction.
Create the buckets and lifecycle rules with an approved Cloudflare credential:

```bash
npx wrangler r2 bucket create whatrdp-backups-staging
npx wrangler r2 bucket create whatrdp-backups-production

npx wrangler r2 bucket lifecycle add whatrdp-backups-staging d1-retention-35d \
  --prefix d1/ --expire-days 35 --force
npx wrangler r2 bucket lifecycle add whatrdp-backups-production d1-retention-35d \
  --prefix d1/ --expire-days 35 --force

npx wrangler r2 bucket lifecycle list whatrdp-backups-staging
npx wrangler r2 bucket lifecycle list whatrdp-backups-production
```

Keep both buckets private: no public access, custom domain or r2.dev URL.

Add **repository** secrets (the scheduled job has no GitHub environment, and a
production environment reviewer would otherwise block it):

- `BACKUP_CLOUDFLARE_API_TOKEN` — dedicated account token scoped to D1
  read/write and R2 read/write only, used only for backups.
- `BACKUP_CLOUDFLARE_ACCOUNT_ID`.

The repository variables `STAGING_D1_DATABASE_NAME` and
`PRODUCTION_D1_DATABASE_NAME` must already exist. Never commit these values or
paste the token into source, chat or logs.

## Running a backup

- Scheduled: daily at 03:17 UTC.
- Manual: **Actions → Backup D1 to R2 → Run workflow**.
- Local, when authenticated:

```bash
export CLOUDFLARE_API_TOKEN=...
export CLOUDFLARE_ACCOUNT_ID=...
npm run backup -- \
  --environment staging \
  --database <staging-database-name> \
  --bucket whatrdp-backups-staging
```

## Verifying a backup

Take the object key from the workflow log, then:

```bash
npx wrangler r2 object get whatrdp-backups-staging/d1/staging/<stamp>.sql \
  --file backup.sql --remote
npx wrangler r2 object get whatrdp-backups-staging/d1/staging/<stamp>.manifest.json \
  --file backup.manifest.json --remote

npm run backup:verify -- --export backup.sql --manifest backup.manifest.json
```

The verifier checks the size, checksum and required tables, without printing the
dump.

## Restore drill

Run this after the first successful backup, then quarterly. Use staging for the
routine drill; a production drill needs explicit approval.

1. Download and verify the latest staging backup (above).
2. Create a disposable database:
   `npx wrangler d1 create whatrdp-restore-drill-YYYYMMDD`
3. Import:
   `npx wrangler d1 execute whatrdp-restore-drill-YYYYMMDD --remote -y --file backup.sql`
4. Read the restored counts into a file:

   ```bash
   npx wrangler d1 execute whatrdp-restore-drill-YYYYMMDD --remote --json -y --command \
     "SELECT 'orders' AS table_name, COUNT(*) AS row_count FROM orders UNION ALL SELECT 'webhook_events', COUNT(*) FROM webhook_events UNION ALL SELECT 'd1_migrations', COUNT(*) FROM d1_migrations" \
     > restored-counts.json
   ```

5. Compare:
   `npm run backup:verify -- --export backup.sql --manifest backup.manifest.json --counts restored-counts.json`
6. Record the result in the drill log below.
7. Delete the disposable database:
   `npx wrangler d1 delete whatrdp-restore-drill-YYYYMMDD`

Never restore over a live database without stopping all writers and holding an
approved recovery plan. A Worker rollback does not reverse database writes.

## Drill log

| Date       | Source     | Result | Notes                                                                                               |
| ---------- | ---------- | ------ | --------------------------------------------------------------------------------------------------- |
| 2026-10-31 | staging    | passed | 2,302 bytes; counts 1 order / 0 webhook events / 4 migrations matched; disposable database deleted. |
| 2026-10-31 | production | backup | 1,848 bytes; counts 0 orders / 1 webhook event / 4 migrations. Imports not drilled.                 |

## Security

The dump contains order tokens (bearer credentials under D-022), customer email
addresses and encrypted server passwords. Treat every object as production
secret material:

- Keep the buckets private and access limited to the backup token.
- Never upload a dump as a GitHub artifact, attach it to a ticket, or paste SQL
  into chat.
- Rotate `BACKUP_CLOUDFLARE_API_TOKEN` if it is exposed; it must not be the
  account-wide deploy token.
