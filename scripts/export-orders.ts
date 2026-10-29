import { DatabaseSync } from "node:sqlite";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve, relative, isAbsolute } from "node:path";

const columns = [
  "id", "token", "plan_sku", "os", "cycle", "amount_cents", "status", "email",
  "service_id", "primary_ip", "username", "password_enc", "error", "stripe_session",
  "created_at", "updated_at",
];

function literal(value: unknown): string {
  if (value === null) return "NULL";
  if (typeof value === "number" && Number.isSafeInteger(value)) return String(value);
  if (typeof value === "string") {
    if (value.includes("\0")) throw new Error("NUL bytes are not supported in this export");
    return `'${value.replaceAll("'", "''")}'`;
  }
  throw new Error("Unexpected order field type");
}

// Offline export ONLY. Read-only SQLite handle and exclusive output creation.
// Caller must supply an offline COPY, not a file being used by live checkout.
export async function exportOrders(source: string, output: string) {
  const target = resolve(output);
  const relativeOutput = relative(resolve("generated-artifacts"), target);
  if (!relativeOutput || relativeOutput.startsWith("..") || isAbsolute(relativeOutput)) {
    throw new Error("Export output must be inside generated-artifacts/");
  }
  const db = new DatabaseSync(resolve(source), { readOnly: true });
  try {
    db.exec("BEGIN");
    const rows = db.prepare(`SELECT ${columns.join(", ")} FROM orders ORDER BY id`).all();
    const tokens = new Set(rows.map((row) => row.token));
    if (tokens.size !== rows.length) throw new Error("Duplicate order tokens; reconcile source first");
    const sql = rows.map((row) =>
      `INSERT INTO orders (${columns.join(", ")}) VALUES (${columns.map((key) => literal(row[key])).join(", ")});`,
    ).join("\n");
    db.exec("COMMIT");
    await mkdir(dirname(target), { recursive: true, mode: 0o700 });
    await writeFile(target, sql + "\n", { flag: "wx", mode: 0o600 });
    return rows.length;
  } finally {
    db.close();
  }
}
