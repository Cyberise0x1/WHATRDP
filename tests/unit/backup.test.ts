import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parse as yaml } from "yaml";
import {
  BACKUP_PREFIX,
  COUNTS_SQL,
  REQUIRED_TABLES,
  RETENTION_DAYS,
  backupKeys,
  buildManifest,
  compareCounts,
  inspectBackupFile,
  orchestrateBackup,
  parseCounts,
  parseManifest,
  verifyBackup,
  type WranglerResult,
} from "../../scripts/lib/backup";

const AT = new Date("2026-10-31T03:17:00.000Z");
const SQL = [
  "CREATE TABLE IF NOT EXISTS orders (id INTEGER PRIMARY KEY);",
  "CREATE TABLE webhook_events (svix_id TEXT PRIMARY KEY);",
  "CREATE TABLE d1_migrations (id INTEGER PRIMARY KEY, name TEXT);",
  "INSERT INTO orders (id) VALUES (1);",
  "",
].join("\n");

const COUNTS = { orders: 1, webhook_events: 0, d1_migrations: 4 };
const COUNTS_JSON = JSON.stringify([
  {
    success: true,
    results: Object.entries(COUNTS).map(([table_name, row_count]) => ({ table_name, row_count })),
  },
]);

async function withTempDir<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), "whatrdp-backup-test-"));
  try {
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test("backup keys are deterministic, UTC and under the retention prefix", () => {
  assert.deepEqual(backupKeys("staging", AT), {
    sql: "d1/staging/20261031T031700Z.sql",
    manifest: "d1/staging/20261031T031700Z.manifest.json",
  });
  assert.equal(BACKUP_PREFIX, "d1/");
  assert.equal(RETENTION_DAYS, 35);
  assert.match(COUNTS_SQL, /webhook_events/);
});

test("row counts require every expected table and non-negative integers", () => {
  assert.deepEqual(parseCounts(COUNTS_JSON), COUNTS);
  assert.throws(() => parseCounts("{}"));
  assert.throws(() =>
    parseCounts(
      JSON.stringify([{ success: true, results: [{ table_name: "orders", row_count: -1 }] }]),
    ),
  );
  assert.throws(() => parseCounts(JSON.stringify([{ success: false, results: [] }])));
});

test("a complete dump verifies, while an altered or incomplete one does not", async () => {
  await withTempDir(async (dir) => {
    const path = join(dir, "backup.sql");
    await writeFile(path, SQL);

    const inspection = await inspectBackupFile(path);
    assert.deepEqual([...inspection.tables].sort(), [...REQUIRED_TABLES].sort());
    assert.equal(inspection.sha256, createHash("sha256").update(SQL).digest("hex"));
    assert.equal(inspection.bytes, Buffer.byteLength(SQL));

    const manifest = buildManifest({
      environment: "staging",
      database: "orders-staging",
      exportedAt: AT,
      keys: backupKeys("staging", AT),
      sha256: inspection.sha256,
      bytes: inspection.bytes,
      rowCounts: COUNTS,
    });
    await assert.doesNotReject(verifyBackup(path, manifest, { ...COUNTS }));
    await assert.rejects(
      verifyBackup(path, { ...manifest, sha256: "0".repeat(64) }),
      /checksum or size/,
    );
    await assert.rejects(
      verifyBackup(path, manifest, { ...COUNTS, orders: 0 }),
      /lower than the export snapshot/,
    );

    const incomplete = join(dir, "incomplete.sql");
    await writeFile(incomplete, "CREATE TABLE orders (id INTEGER);\n");
    await assert.rejects(verifyBackup(incomplete), /missing required tables/);

    const empty = join(dir, "empty.sql");
    await writeFile(empty, "");
    await assert.rejects(verifyBackup(empty), /empty/);
  });
});

test("restored counts may grow but never shrink or lose a table", () => {
  const grown = compareCounts(COUNTS, { orders: 2, webhook_events: 0, d1_migrations: 4 });
  assert.deepEqual(
    grown.higher.map((entry) => entry.table),
    ["orders"],
  );
  assert.deepEqual(grown.lower, []);
  assert.deepEqual(grown.missing, []);

  const missing = compareCounts(COUNTS, { orders: 1, d1_migrations: 4 });
  assert.deepEqual(missing.missing, ["webhook_events"]);

  const shrunk = compareCounts(COUNTS, { orders: 0, webhook_events: 0, d1_migrations: 4 });
  assert.deepEqual(shrunk.lower, [{ table: "orders", expected: 1, actual: 0 }]);
});

test("a backup uploads only after a valid export, in the expected order", async () => {
  await withTempDir(async (dir) => {
    const calls: string[][] = [];
    const run = (args: string[]): WranglerResult => {
      calls.push(args);
      if (args[0] === "d1" && args[1] === "execute") {
        return { status: 0, stdout: COUNTS_JSON, stderr: "" };
      }
      if (args[0] === "d1" && args[1] === "export") {
        writeFileSync(args[args.indexOf("--output") + 1], SQL);
        return { status: 0, stdout: "", stderr: "" };
      }
      return { status: 0, stdout: "", stderr: "" };
    };

    const result = await orchestrateBackup(
      { environment: "staging", database: "orders-staging", bucket: "whatrdp-backups-staging" },
      { run, workDir: dir, now: AT },
    );

    assert.equal(calls.length, 4);
    assert.deepEqual(calls[0], [
      "d1",
      "execute",
      "orders-staging",
      "--remote",
      "--json",
      "-y",
      "--command",
      COUNTS_SQL,
    ]);
    assert.deepEqual(calls[1], [
      "d1",
      "export",
      "orders-staging",
      "--remote",
      "--skip-confirmation",
      "--output",
      join(dir, "backup.sql"),
    ]);
    assert.deepEqual(calls[2], [
      "r2",
      "object",
      "put",
      "whatrdp-backups-staging/d1/staging/20261031T031700Z.sql",
      "--file",
      join(dir, "backup.sql"),
      "--content-type",
      "application/sql",
      "--remote",
      "--force",
    ]);
    assert.deepEqual(calls[3], [
      "r2",
      "object",
      "put",
      "whatrdp-backups-staging/d1/staging/20261031T031700Z.manifest.json",
      "--file",
      join(dir, "backup.manifest.json"),
      "--content-type",
      "application/json",
      "--remote",
      "--force",
    ]);

    const manifest = parseManifest(await readFile(join(dir, "backup.manifest.json"), "utf8"));
    assert.deepEqual(manifest.rowCountsAtExportStart, COUNTS);
    assert.equal(manifest.sha256, result.manifest.sha256);
    assert.equal(manifest.bytes, Buffer.byteLength(SQL));
  });
});

test("a failed export or failed integrity check never reaches R2", async () => {
  await withTempDir(async (dir) => {
    const calls: string[][] = [];
    const failing = (args: string[]): WranglerResult => {
      calls.push(args);
      if (args[1] === "execute") return { status: 0, stdout: COUNTS_JSON, stderr: "" };
      if (args[1] === "export") return { status: 1, stdout: "", stderr: "" };
      return { status: 0, stdout: "", stderr: "" };
    };
    await assert.rejects(
      orchestrateBackup(
        { environment: "staging", database: "orders-staging", bucket: "whatrdp-backups-staging" },
        { run: failing, workDir: dir, now: AT },
      ),
      /export failed/,
    );
    assert.equal(
      calls.some((args) => args[0] === "r2"),
      false,
    );
  });

  await withTempDir(async (dir) => {
    const calls: string[][] = [];
    const incomplete = (args: string[]): WranglerResult => {
      calls.push(args);
      if (args[1] === "execute") return { status: 0, stdout: COUNTS_JSON, stderr: "" };
      if (args[1] === "export") {
        writeFileSync(args[args.indexOf("--output") + 1], "CREATE TABLE orders (id INTEGER);\n");
        return { status: 0, stdout: "", stderr: "" };
      }
      return { status: 0, stdout: "", stderr: "" };
    };
    await assert.rejects(
      orchestrateBackup(
        { environment: "staging", database: "orders-staging", bucket: "whatrdp-backups-staging" },
        { run: incomplete, workDir: dir, now: AT },
      ),
      /integrity checks/,
    );
    assert.equal(
      calls.some((args) => args[0] === "r2"),
      false,
    );
  });

  await withTempDir(async (dir) => {
    const calls: string[][] = [];
    const noCounts = (args: string[]): WranglerResult => {
      calls.push(args);
      return { status: 1, stdout: "", stderr: "" };
    };
    await assert.rejects(
      orchestrateBackup(
        {
          environment: "production",
          database: "orders-production",
          bucket: "whatrdp-backups-production",
        },
        { run: noCounts, workDir: dir, now: AT },
      ),
      /row counts/,
    );
    assert.equal(calls.length, 1);
  });
});

test("required application tables exist in the migrations", async () => {
  const files = (await readdir("migrations")).filter((name) => name.endsWith(".sql"));
  const sql = (
    await Promise.all(files.map((name) => readFile(join("migrations", name), "utf8")))
  ).join("\n");
  for (const table of ["orders", "webhook_events"]) {
    assert.match(sql, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}\\b`, "i"));
  }
});

test("the backup workflow is scheduled, gated and never publishes the dump", async () => {
  const content = await readFile(".github/workflows/backup-d1.yml", "utf8");
  const workflow = yaml(content);

  assert.equal(workflow.permissions.contents, "read");
  assert.equal(workflow.on.schedule[0].cron, "17 3 * * *");
  assert.ok("workflow_dispatch" in workflow.on);
  assert.equal(workflow.jobs.backup.environment, undefined);
  assert.equal(workflow.jobs.backup["timeout-minutes"], 60);
  assert.equal(workflow.jobs.backup.strategy["fail-fast"], false);
  assert.deepEqual(
    workflow.jobs.backup.strategy.matrix.include.map(
      (entry: { environment: string }) => entry.environment,
    ),
    ["staging", "production"],
  );
  assert.match(content, /secrets\.BACKUP_CLOUDFLARE_API_TOKEN/);
  assert.match(content, /secrets\.BACKUP_CLOUDFLARE_ACCOUNT_ID/);
  assert.doesNotMatch(content, /secrets\.CLOUDFLARE_API_TOKEN/);
  assert.doesNotMatch(content, /upload-artifact/);

  for (const action of content.matchAll(/uses:\s*([^\s#]+)/g)) {
    assert.ok(action[1].startsWith("./") || /@[a-f0-9]{40}$/.test(action[1]), action[1]);
  }
});
