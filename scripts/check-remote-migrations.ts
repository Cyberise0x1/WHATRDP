import { readdir } from "node:fs/promises";
import { spawnSync } from "node:child_process";

async function main() {
  if (process.env.DEPLOYMENT_APPROVED !== "true") throw new Error("Not approved");
  // Read-only check after release approval. This script NEVER applies migrations.
  const result = spawnSync(
    "node_modules/.bin/wrangler",
    [
      "d1",
      "execute",
      "DB",
      "--remote",
      "--config",
      "generated-artifacts/deployment/wrangler.json",
      "--command",
      "SELECT name FROM d1_migrations",
      "--json",
    ],
    { encoding: "utf8", timeout: 60000 },
  );
  if (result.status !== 0) throw new Error("Schema state could not be verified");
  const records = JSON.parse(result.stdout) as { success: boolean; results: { name: string }[] }[];
  if (!records.length || records.some((r) => !r.success)) throw new Error("Schema query failed");
  const applied = new Set(records.flatMap((r) => r.results.map((row) => row.name)));
  const missing = (await readdir("migrations")).filter(
    (name) => name.endsWith(".sql") && !applied.has(name),
  );
  if (missing.length) throw new Error("Approved manual migrations are required");
  console.log("All application migrations are recorded in the selected database.");
}
main().catch(() => {
  console.error(
    "Remote schema readiness failed. No migrations were applied; obtain approval and reconcile the database before deployment.",
  );
  process.exitCode = 1;
});
