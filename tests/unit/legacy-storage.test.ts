import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { exportOrders } from "../../scripts/export-orders";
import { getDatabase } from "../../src/lib/database";

test("historical references export neutrally and old databases are never auto-migrated", async () => {
  await mkdir("generated-artifacts", { recursive: true });
  const dir = await mkdtemp(join(tmpdir(), "legacy-orders-"));
  const out = await mkdtemp(resolve("generated-artifacts/legacy-export-"));
  const file = join(dir, "copy.db");
  const database = new DatabaseSync(file);
  database.exec(await readFile("migrations/0001_orders.sql", "utf8"));
  database
    .prepare(
      `INSERT INTO orders (id, token, plan_sku, os, cycle, amount_cents, status, stripe_session, password_enc, created_at, updated_at)
    VALUES (7, 'fixture-legacy-token', 'europe/1', 'windows-2022', 'MONTHLY', 1599, 'ACTIVE', 'historical-reference', 'unchanged-ciphertext', '2026-01-01', '2026-01-01')`,
    )
    .run();
  database.close();
  try {
    const bytes = await readFile(file);
    const output = join(out, "orders.sql");
    assert.equal(await exportOrders(file, output), 1);
    const exported = await readFile(output, "utf8");
    assert.match(exported, /payment_reference, currency/);
    assert.match(exported, /'historical-reference', 'USD'/);
    assert.match(exported, /unchanged-ciphertext/);
    process.env.DATABASE_PATH = file;
    await assert.rejects(getDatabase(), /approved forward migration/);
    assert.deepEqual(await readFile(file), bytes);
    const migrated = new DatabaseSync(":memory:");
    migrated.exec(await readFile("migrations/0001_orders.sql", "utf8"));
    migrated.exec(await readFile("migrations/0002_payment_reference.sql", "utf8"));
    migrated.exec(await readFile("migrations/0003_charge_currency.sql", "utf8"));
    migrated.exec(exported);
    const row = migrated
      .prepare("SELECT payment_reference, password_enc, currency FROM orders")
      .get();
    assert.deepEqual(
      { ...row },
      {
        payment_reference: "historical-reference",
        password_enc: "unchanged-ciphertext",
        currency: "USD",
      },
    );
    migrated.close();
  } finally {
    await rm(dir, { recursive: true, force: true });
    await rm(out, { recursive: true, force: true });
  }
});
