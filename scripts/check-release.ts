import { readFile, readdir, stat } from "node:fs/promises";
import { resolve } from "node:path";

async function main() {
  const root = resolve("generated-artifacts/release");
  // The deployment entry is custom-worker.ts (see scripts/lib/deployment.ts), so
  // Wrangler emits custom-worker.js — not the generated .open-next/worker.js.
  await stat(resolve(root, "custom-worker.js"));

  let workflowExported = false;
  for (const file of await readdir(root, { recursive: true })) {
    if (!/\.(mjs|js)$/.test(file)) continue;
    const content = await readFile(resolve(root, file), "utf8");
    if (/\/__fixture\/sql|node:sqlite|api\.stripe\.com|STRIPE_SECRET_KEY|whmcs/i.test(content)) {
      throw new Error("Release contains a forbidden runtime dependency or fixture endpoint");
    }
    if (/ProvisionWorkflow/.test(content)) workflowExported = true;
  }
  if (!workflowExported) {
    throw new Error("Release bundle is missing the provisioning Workflow export");
  }
  console.log(
    "Normal release bundle excludes SQL fixtures, native SQLite and removed gateways, and exports the provisioning Workflow.",
  );
}
main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Release check failed");
  process.exitCode = 1;
});
