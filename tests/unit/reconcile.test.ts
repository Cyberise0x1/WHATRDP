import { after, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { reconcileOrders, type ReconcileEnv } from "../../src/lib/reconcile";
import { decryptSecret, encryptSecret } from "../../src/lib/crypto";
import { OrderRepository } from "../../src/lib/storage/repository";
import type { Server } from "../../src/lib/rdpmonster";
import type { Order, OrderStatus } from "../../src/lib/storage/types";
import { getDatabase } from "../../src/lib/database";

const SECRET = "fixture_app_secret_at_least_16";

let directory: string;
let repo: OrderRepository;
let env: ReconcileEnv;
let dispatched: string[];

function server(status: string): Server {
  return {
    id: "srv_1",
    label: "web-fixture",
    status,
    power: "on",
    product: null,
    plan: null,
    resellerProduct: null,
    region: null,
    tier: null,
    os: null,
    resources: { cpuCores: 2, ramMb: 6144, diskGb: 40, ipv4Count: 1 },
    ips: [{ id: "ip_1", address: "203.0.113.10", version: 4, primary: true }],
    cycle: "MONTHLY",
    priceCents: 899,
    autoRenew: false,
    expiresAt: null,
  };
}

async function backdate(id: number, minutes = 60) {
  const db = await getDatabase();
  await db
    .prepare("UPDATE orders SET updated_at = ? WHERE id = ?")
    .bind(new Date(Date.now() - minutes * 60_000).toISOString(), id)
    .all();
}

async function makeOrder(status: OrderStatus, serviceId?: string): Promise<Order> {
  const order = await repo.create({
    planSku: "europe/1",
    os: "windows-2022",
    cycle: "MONTHLY",
    amountCents: 1599,
    chargeCurrency: "USD",
    chargeAmountMinor: 1599,
  });
  return repo.update(order.id, {
    status,
    ...(serviceId ? { service_id: serviceId } : {}),
  });
}

before(async () => {
  directory = await mkdtemp(join(tmpdir(), "rdpm-reconcile-"));
  process.env.DATABASE_PATH = join(directory, "fixture.db");
  process.env.APP_SECRET = SECRET;
  const db = await getDatabase();
  repo = new OrderRepository(db);
  env = {
    DB: db,
    PROVISIONING_ENABLED: "true",
    APP_SECRET: SECRET,
    RDP_MONSTER_API_TOKEN: "fixture_not_a_real_token",
    PROVISION_WORKFLOW: {
      create: async ({ id }: { id?: string }) => {
        dispatched.push(String(id));
      },
    },
  };
});

beforeEach(async () => {
  await (await getDatabase()).prepare("DELETE FROM orders").all();
  dispatched = [];
});

after(async () => {
  await rm(directory, { recursive: true, force: true });
});

test("only settled work older than the cutoff is scanned", async () => {
  await makeOrder("PAID"); // fresh
  const stale = await makeOrder("PAID");
  await backdate(stale.id);

  const result = await reconcileOrders(env, { repo });
  assert.equal(result.scanned, 1);
  assert.deepEqual(dispatched, [`order-${stale.id}`]);
});

test("PAID orders are not dispatched while provisioning is disabled", async () => {
  const stale = await makeOrder("PAID");
  await backdate(stale.id);

  const result = await reconcileOrders({ ...env, PROVISIONING_ENABLED: "false" }, { repo });
  assert.equal(result.scanned, 1);
  assert.equal(result.dispatched, 0);
  assert.deepEqual(dispatched, []);
  assert.equal((await repo.byId(stale.id))?.status, "PAID");
});

test("a duplicate deterministic instance counts as dispatched", async () => {
  const stale = await makeOrder("PAID");
  await backdate(stale.id);

  const result = await reconcileOrders(
    {
      ...env,
      PROVISION_WORKFLOW: {
        create: async () => {
          throw new Error("instance already exists");
        },
      },
    },
    { repo },
  );
  assert.equal(result.dispatched, 1);
});

test("an interrupted claim without a service is marked for review, never retried", async () => {
  const stale = await makeOrder("PROVISIONING");
  await backdate(stale.id);

  const result = await reconcileOrders(env, { repo });
  assert.equal(result.reviewed, 1);
  const stored = await repo.byId(stale.id);
  assert.equal(stored?.status, "REVIEW_REQUIRED");
  assert.match(stored?.error ?? "", /reconcile/i);
});

test("a provisioning order with a service is synced, and credentials are stored once ACTIVE", async () => {
  const stale = await makeOrder("PROVISIONING", "srv_1");
  await backdate(stale.id);

  const result = await reconcileOrders(env, {
    repo,
    getServer: async () => server("ACTIVE"),
    getCredentials: async () => ({ user: "Administrator", password: "s3cret" }),
    encrypt: encryptSecret,
  });
  assert.equal(result.synced, 1);
  const stored = await repo.byId(stale.id);
  assert.equal(stored?.status, "ACTIVE");
  assert.equal(stored?.primary_ip, "203.0.113.10");
  assert.equal(decryptSecret(stored?.password_enc ?? "", SECRET), "s3cret");
});

test("a supplier read failure leaves the order for the next run", async () => {
  const stale = await makeOrder("PROVISIONING", "srv_1");
  await backdate(stale.id);

  const result = await reconcileOrders(env, {
    repo,
    getServer: async () => {
      throw new Error("upstream unavailable");
    },
  });
  assert.equal(result.scanned, 1);
  assert.equal(result.synced, 0);
  assert.equal((await repo.byId(stale.id))?.status, "PROVISIONING");
});

test("each run is bounded by the limit", async () => {
  for (let index = 0; index < 3; index += 1) {
    const order = await makeOrder("PAID");
    await backdate(order.id, 60 + index);
  }

  const result = await reconcileOrders(env, { repo, limit: 2 });
  assert.equal(result.scanned, 2);
  assert.equal(dispatched.length, 2);
});
