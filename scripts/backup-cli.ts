import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  orchestrateBackup,
  parseCounts,
  parseManifest,
  verifyBackup,
  type BackupEnvironment,
  type WranglerResult,
} from "./lib/backup";

function parseFlags(args: string[]): Map<string, string> {
  const flags = new Map<string, string>();
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg.startsWith("--")) throw new Error(`Unexpected argument: ${arg}`);
    const value = args[index + 1];
    if (value === undefined || value.startsWith("--")) {
      throw new Error(`Missing value for ${arg}`);
    }
    flags.set(arg.slice(2), value);
    index += 1;
  }
  return flags;
}

function required(flags: Map<string, string>, name: string): string {
  const value = flags.get(name)?.trim();
  if (!value) throw new Error(`--${name} is required`);
  return value;
}

function environment(flags: Map<string, string>): BackupEnvironment {
  const value = required(flags, "environment");
  if (value !== "staging" && value !== "production") {
    throw new Error("--environment must be staging or production");
  }
  return value;
}

function wrangler(args: string[]): WranglerResult {
  const result = spawnSync("node_modules/.bin/wrangler", args, {
    encoding: "utf8",
    env: process.env,
    timeout: 55 * 60 * 1000,
  });
  return {
    status: result.status,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}

async function run(): Promise<void> {
  const flags = parseFlags(process.argv.slice(3));
  const target = environment(flags);
  const database = required(flags, "database");
  const bucket = required(flags, "bucket");
  const workDir = await mkdtemp(join(tmpdir(), "whatrdp-backup-"));

  try {
    const result = await orchestrateBackup(
      { environment: target, database, bucket },
      { run: wrangler, workDir },
    );
    console.log(`Backup uploaded: ${bucket}/${result.keys.sql}`);
    console.log(`Manifest uploaded: ${bucket}/${result.keys.manifest}`);
    console.log(`Bytes: ${result.manifest.bytes}; sha256: ${result.manifest.sha256}`);
    console.log(`Row counts at export start: ${JSON.stringify(result.rowCounts)}`);
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}

async function verify(): Promise<void> {
  const flags = parseFlags(process.argv.slice(3));
  const exportPath = required(flags, "export");
  const manifestPath = required(flags, "manifest");
  const manifest = parseManifest(await readFile(manifestPath, "utf8"));

  const countsPath = flags.get("counts");
  const restored = countsPath ? parseCounts(await readFile(countsPath, "utf8")) : undefined;
  const result = await verifyBackup(exportPath, manifest, restored);

  console.log(`Verified ${exportPath}: ${result.bytes} bytes, sha256 ${result.sha256}`);
  console.log(`Tables present: ${result.tables.join(", ")}`);
  if (result.counts?.higher.length) {
    console.log(`Row counts grew since the snapshot: ${JSON.stringify(result.counts.higher)}`);
  }
  if (result.counts) console.log("Restored row counts are consistent with the manifest.");
}

const handlers: Record<string, () => Promise<void>> = { run, verify };
const handler = handlers[process.argv[2]];
if (!handler) {
  console.error("Usage: backup-cli.ts <run|verify> --flags…");
  process.exitCode = 1;
} else {
  handler().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "Backup command failed");
    process.exitCode = 1;
  });
}
