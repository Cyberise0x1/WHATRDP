import { getCloudflareContext } from "@opennextjs/cloudflare";
import type { SqlDatabase } from "./storage/types";

export async function getDatabase(): Promise<SqlDatabase> {
  const { env } = await getCloudflareContext({ async: true });
  if (!env.DB) throw new Error("D1 DB binding is not configured");
  return env.DB;
}
