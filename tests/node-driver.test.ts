import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { OrderRepository } from "../storefront/src/lib/storage/repository";
import { getDatabase } from "../storefront/src/lib/database";

test("ordinary Node development retains the SQLite driver on an isolated fixture", async () => {
  const directory = await mkdtemp(join(tmpdir(), "rdpm-node-driver-"));
  process.env.DATABASE_PATH = join(directory, "fixture.db");
  try {
    const repo = new OrderRepository(await getDatabase());
    const order = await repo.create({ planSku: "europe/1", os: "windows-2022", cycle: "MONTHLY", amountCents: 1599 });
    await repo.update(order.id, { stripe_session: "cs_node_fixture" });
    assert.equal((await repo.byToken(order.token))?.plan_sku, "europe/1");
    assert.ok(await repo.claimPayment(order.id, "cs_node_fixture", 1599));
    assert.equal(await repo.claimPayment(order.id, "cs_node_fixture", 1599), null);
    assert.ok(await repo.claimProvision(order.id));
    assert.equal(await repo.claimProvision(order.id), null);
    assert.equal((await repo.recent()).length, 1);
    await assert.rejects(repo.update(order.id, { ["status = 'ACTIVE'; --"]: "x" } as never), /Unsupported/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
