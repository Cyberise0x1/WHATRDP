import { readFile, mkdir, writeFile } from "node:fs/promises";
import { deploymentConfig } from "./lib/deployment";
import { parse, type ParseError } from "jsonc-parser";

async function main() {
  const errors: ParseError[] = [];
  const base = parse(await readFile("wrangler.jsonc", "utf8"), errors, {
    allowTrailingComma: true,
  });
  if (errors.length) throw new Error("Invalid base configuration");
  const config = deploymentConfig(process.argv[2], process.env, base);
  await mkdir("generated-artifacts/deployment", { recursive: true });
  await writeFile(
    "generated-artifacts/deployment/wrangler.json",
    JSON.stringify(config, null, 2) + "\n",
  );
  console.log("Prepared environment-specific configuration; no remote action performed.");
}
main().catch(() => {
  console.error(
    "Deployment configuration rejected. Check approval, environment names and distinct non-placeholder database bindings.",
  );
  process.exitCode = 1;
});
