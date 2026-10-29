import { readFile, writeFile } from "node:fs/promises";

// Normalize only generated lock metadata after a firewall-managed install.
// Registry selection and integrity hashes remain unchanged; npm still uses
// the current environment's configured registry when installing.
const file = new URL("../package-lock.json", import.meta.url);
const lock = JSON.parse(await readFile(file, "utf8"));
for (const entry of Object.values(lock.packages ?? {})) {
  if (!entry.resolved) continue;
  const url = new URL(entry.resolved, "file:///");
  if (url.hostname === "package-firewall.replit.internal" && url.pathname.startsWith("/npm/")) {
    entry.resolved = `https://registry.npmjs.org/${url.pathname.slice(5)}`;
  }
}
await writeFile(file, JSON.stringify(lock, null, 2) + "\n");
