// Node-only driver. The Cloudflare build aliases this module to database.cloudflare.ts.
import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { SCHEMA } from "./storage/schema";
import type { SqlDatabase, SqlStatement } from "./storage/types";

let database: SqlDatabase | undefined;

export async function getDatabase(): Promise<SqlDatabase> {
  if (database) return database;
  const file = process.env.DATABASE_PATH ?? join(process.cwd(), "data", "storefront.db");
  mkdirSync(dirname(file), { recursive: true });
  const sqlite = new DatabaseSync(file);
  sqlite.exec("PRAGMA journal_mode = WAL;");
  sqlite.exec(SCHEMA);
  database = {
    prepare(sql) {
      const stmt = sqlite.prepare(sql);
      let values: (string | number | null)[] = [];
      const wrapper: SqlStatement = {
        bind(...args) { values = args; return wrapper; },
        async first<T>() { return (stmt.get(...values) as T | undefined) ?? null; },
        async all<T>() { return { results: stmt.all(...values) as T[] }; },
      };
      return wrapper;
    },
  };
  return database;
}
