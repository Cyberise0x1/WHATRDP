import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { StringDecoder } from "node:string_decoder";

export type BackupEnvironment = "staging" | "production";

export const BACKUP_PREFIX = "d1/";
export const RETENTION_DAYS = 35;
export const REQUIRED_TABLES = ["orders", "webhook_events", "d1_migrations"] as const;

export const COUNTS_SQL = [
  "SELECT 'orders' AS table_name, COUNT(*) AS row_count FROM orders",
  "SELECT 'webhook_events' AS table_name, COUNT(*) AS row_count FROM webhook_events",
  "SELECT 'd1_migrations' AS table_name, COUNT(*) AS row_count FROM d1_migrations",
].join(" UNION ALL ");

export interface RowCounts {
  [table: string]: number;
}

export interface BackupKeys {
  sql: string;
  manifest: string;
}

export interface BackupManifest {
  environment: BackupEnvironment;
  database: string;
  exportedAt: string;
  sqlKey: string;
  manifestKey: string;
  sha256: string;
  bytes: number;
  rowCountsAtExportStart: RowCounts;
}

export interface WranglerResult {
  status: number | null;
  stdout: string;
  stderr: string;
}

export type WranglerRunner = (args: string[]) => WranglerResult;

const TABLE_PATTERN = new RegExp(
  "CREATE\\s+TABLE\\s+(?:IF\\s+NOT\\s+EXISTS\\s+)?[\"'`]?(" +
    REQUIRED_TABLES.join("|") +
    ")[\"'`]?",
  "i",
);

export function backupKeys(environment: BackupEnvironment, at: Date): BackupKeys {
  const stamp = at
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z");
  const base = `${BACKUP_PREFIX}${environment}/${stamp}`;
  return { sql: `${base}.sql`, manifest: `${base}.manifest.json` };
}

export function parseCounts(stdout: string): RowCounts {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    throw new Error("D1 row counts were not JSON");
  }
  if (!Array.isArray(parsed)) throw new Error("D1 row counts were not an array");

  const counts: RowCounts = {};
  for (const entry of parsed) {
    if (!entry || typeof entry !== "object") throw new Error("D1 row counts were invalid");
    const record = entry as { success?: unknown; results?: unknown };
    if (record.success !== true) throw new Error("The D1 row count query did not succeed");
    if (!Array.isArray(record.results)) continue;
    for (const row of record.results) {
      if (!row || typeof row !== "object") continue;
      const value = row as { table_name?: unknown; row_count?: unknown };
      if (typeof value.table_name !== "string") continue;
      if (!(REQUIRED_TABLES as readonly string[]).includes(value.table_name)) continue;
      if (!Number.isSafeInteger(value.row_count) || (value.row_count as number) < 0) {
        throw new Error(`D1 returned an invalid row count for ${value.table_name}`);
      }
      counts[value.table_name] = value.row_count as number;
    }
  }

  const missing = REQUIRED_TABLES.filter((table) => !(table in counts));
  if (missing.length) throw new Error(`D1 row counts are missing: ${missing.join(", ")}`);
  return counts;
}

export interface BackupFileInspection {
  sha256: string;
  bytes: number;
  tables: string[];
}

/**
 * One streaming pass: SHA-256 for integrity plus the `CREATE TABLE` statements
 * needed to prove the dump is a complete schema. Never loads the dump into memory.
 */
export async function inspectBackupFile(path: string): Promise<BackupFileInspection> {
  const file = await stat(path).catch(() => null);
  if (!file?.isFile()) throw new Error("Backup file is missing");
  if (file.size === 0) throw new Error("Backup file is empty");

  const hash = createHash("sha256");
  const decoder = new StringDecoder("utf8");
  const found = new Set<string>();
  let bytes = 0;
  let carry = "";

  await new Promise<void>((resolve, reject) => {
    const stream = createReadStream(path);
    stream.on("data", (chunk: string | Buffer) => {
      const buffer = typeof chunk === "string" ? Buffer.from(chunk) : chunk;
      bytes += buffer.length;
      hash.update(buffer);
      if (found.size === REQUIRED_TABLES.length) return;

      const text = carry + decoder.write(buffer);
      const lines = text.split("\n");
      carry = lines.pop() ?? "";
      if (carry.length > 4096) carry = carry.slice(-4096);
      for (const line of lines) {
        const match = TABLE_PATTERN.exec(line);
        if (match) found.add(match[1].toLowerCase());
      }
    });
    stream.on("error", reject);
    stream.on("end", () => {
      if (found.size < REQUIRED_TABLES.length && carry) {
        const match = TABLE_PATTERN.exec(carry);
        if (match) found.add(match[1].toLowerCase());
      }
      resolve();
    });
  });

  return { sha256: hash.digest("hex"), bytes, tables: [...found] };
}

export function buildManifest(input: {
  environment: BackupEnvironment;
  database: string;
  exportedAt: Date;
  keys: BackupKeys;
  sha256: string;
  bytes: number;
  rowCounts: RowCounts;
}): BackupManifest {
  return {
    environment: input.environment,
    database: input.database,
    exportedAt: input.exportedAt.toISOString(),
    sqlKey: input.keys.sql,
    manifestKey: input.keys.manifest,
    sha256: input.sha256,
    bytes: input.bytes,
    rowCountsAtExportStart: input.rowCounts,
  };
}

export function parseManifest(text: string): BackupManifest {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error("Backup manifest was not JSON");
  }
  if (!value || typeof value !== "object") throw new Error("Backup manifest was invalid");
  const manifest = value as Partial<BackupManifest>;

  if (manifest.environment !== "staging" && manifest.environment !== "production") {
    throw new Error("Backup manifest has an unknown environment");
  }
  if (typeof manifest.database !== "string" || manifest.database.length === 0) {
    throw new Error("Backup manifest has no database");
  }
  if (typeof manifest.exportedAt !== "string" || Number.isNaN(Date.parse(manifest.exportedAt))) {
    throw new Error("Backup manifest has no valid export time");
  }
  if (typeof manifest.sqlKey !== "string" || typeof manifest.manifestKey !== "string") {
    throw new Error("Backup manifest has no object keys");
  }
  if (typeof manifest.sha256 !== "string" || !/^[a-f0-9]{64}$/.test(manifest.sha256)) {
    throw new Error("Backup manifest has no valid checksum");
  }
  if (!Number.isSafeInteger(manifest.bytes) || (manifest.bytes as number) <= 0) {
    throw new Error("Backup manifest has no valid size");
  }
  if (!manifest.rowCountsAtExportStart || typeof manifest.rowCountsAtExportStart !== "object") {
    throw new Error("Backup manifest has no row counts");
  }
  for (const table of REQUIRED_TABLES) {
    const count = manifest.rowCountsAtExportStart[table];
    if (!Number.isSafeInteger(count) || count < 0) {
      throw new Error(`Backup manifest has no valid row count for ${table}`);
    }
  }
  return manifest as BackupManifest;
}

export interface CountMismatch {
  table: string;
  expected: number;
  actual: number;
}

export interface CountComparison {
  missing: string[];
  lower: CountMismatch[];
  higher: CountMismatch[];
}

/**
 * A table that is absent or smaller than the export snapshot is data loss. A
 * larger count is allowed: writes can land between the count query and the
 * export snapshot.
 */
export function compareCounts(expected: RowCounts, actual: RowCounts): CountComparison {
  const missing: string[] = [];
  const lower: CountMismatch[] = [];
  const higher: CountMismatch[] = [];

  for (const [table, expectedCount] of Object.entries(expected)) {
    const actualCount = actual[table];
    if (!Number.isSafeInteger(actualCount)) {
      missing.push(table);
      continue;
    }
    if (actualCount < expectedCount) {
      lower.push({ table, expected: expectedCount, actual: actualCount });
    } else if (actualCount > expectedCount) {
      higher.push({ table, expected: expectedCount, actual: actualCount });
    }
  }

  return { missing, lower, higher };
}

export interface BackupVerification {
  sha256: string;
  bytes: number;
  tables: string[];
  counts?: CountComparison;
}

export async function verifyBackup(
  path: string,
  manifest?: BackupManifest,
  restoredCounts?: RowCounts,
): Promise<BackupVerification> {
  const inspection = await inspectBackupFile(path);

  if (manifest && (inspection.sha256 !== manifest.sha256 || inspection.bytes !== manifest.bytes)) {
    throw new Error("Backup checksum or size does not match the manifest");
  }

  const missingTables = REQUIRED_TABLES.filter((table) => !inspection.tables.includes(table));
  if (missingTables.length) {
    throw new Error(`Backup is missing required tables: ${missingTables.join(", ")}`);
  }

  let counts: CountComparison | undefined;
  if (manifest && restoredCounts) {
    counts = compareCounts(manifest.rowCountsAtExportStart, restoredCounts);
    if (counts.missing.length || counts.lower.length) {
      throw new Error("Restored row counts are lower than the export snapshot");
    }
  }

  return { ...inspection, counts };
}

export interface BackupRequest {
  environment: BackupEnvironment;
  database: string;
  bucket: string;
}

export interface BackupDeps {
  run: WranglerRunner;
  workDir: string;
  now?: Date;
  inspect?: typeof inspectBackupFile;
  write?: (path: string, data: string) => Promise<void>;
}

export interface BackupResult {
  keys: BackupKeys;
  manifest: BackupManifest;
  rowCounts: RowCounts;
}

/**
 * Export, verify, then upload. Verification always precedes any R2 write, so a
 * failed or truncated export can never replace a good backup.
 */
export async function orchestrateBackup(
  request: BackupRequest,
  deps: BackupDeps,
): Promise<BackupResult> {
  const { environment, database, bucket } = request;
  if (!database.trim()) throw new Error("A D1 database name is required");
  if (!bucket.trim()) throw new Error("An R2 bucket name is required");

  const now = deps.now ?? new Date();
  const keys = backupKeys(environment, now);
  const exportPath = join(deps.workDir, "backup.sql");
  const manifestPath = join(deps.workDir, "backup.manifest.json");

  const counts = deps.run([
    "d1",
    "execute",
    database,
    "--remote",
    "--json",
    "-y",
    "--command",
    COUNTS_SQL,
  ]);
  if (counts.status !== 0) throw new Error("Reading D1 row counts failed");
  const rowCounts = parseCounts(counts.stdout);

  const exported = deps.run([
    "d1",
    "export",
    database,
    "--remote",
    "--skip-confirmation",
    "--output",
    exportPath,
  ]);
  if (exported.status !== 0) throw new Error("The D1 export failed");

  const inspection = await (deps.inspect ?? inspectBackupFile)(exportPath);
  const missing = REQUIRED_TABLES.filter((table) => !inspection.tables.includes(table));
  if (inspection.bytes === 0 || missing.length) {
    throw new Error("The exported SQL failed integrity checks");
  }

  const manifest = buildManifest({
    environment,
    database,
    exportedAt: now,
    keys,
    sha256: inspection.sha256,
    bytes: inspection.bytes,
    rowCounts,
  });
  await (deps.write ?? writeFile)(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

  const sqlUpload = deps.run([
    "r2",
    "object",
    "put",
    `${bucket}/${keys.sql}`,
    "--file",
    exportPath,
    "--content-type",
    "application/sql",
    "--remote",
    "--force",
  ]);
  if (sqlUpload.status !== 0) throw new Error("Uploading the SQL backup failed");

  const manifestUpload = deps.run([
    "r2",
    "object",
    "put",
    `${bucket}/${keys.manifest}`,
    "--file",
    manifestPath,
    "--content-type",
    "application/json",
    "--remote",
    "--force",
  ]);
  if (manifestUpload.status !== 0) throw new Error("Uploading the backup manifest failed");

  return { keys, manifest, rowCounts };
}
