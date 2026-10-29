import type { SqlDatabase } from "./src/lib/storage/types";

declare global {
  interface CloudflareEnv {
    DB: SqlDatabase;
  }
}
