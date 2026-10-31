import { after, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { WorkflowStep } from "cloudflare:workers";
import { runProvisionFlow, type ProvisionEnv } from "../../src/lib/provision-flow";
import { decryptSecret, encryptSecret } from "../../src/lib/crypto";
import { OrderRepository } from "../../src/lib/storage/repository";
import type { Server, SupplierAuth } from "../../src/lib/rdpmonster";
import { getDatabase } from "../../src/lib/database";

const SECRET = "fixture_app_secret_at_least_16";

let directory: string;
let repo: OrderRepository;

const env: ProvisionEnv = {
  PROVISIONING_ENABLED: "true",
  APP_SECRET: SECRET,
  RDP_MONSTER_API_TOKEN: "fixture_not_a_real_token",
};

function immediateStep(): WorkflowStep {
  return {
    async do(...args: unknown[]) {
      const callback = args.find((arg) => typeof arg === "function") as () => Promise<unknown>;
      return callback();
    },
    async sleep() {},
    async sleepUntil() {},
  } as unknown as WorkflowStep;
}

function server(status: string, ip = "203.0.113.10"): Server {
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
    ips: [{ id: "ip_1", address: ip, version: 4, primary: true }],
    cycle: "MONTHLY",
    priceCents: 899,
    autoRenew: false,
    expiresAt: null,
  };
}

async function paidOrder() {
  const order = await repo.create({
    planSku: "europe/1",
    os: "windows-2022",
    cycle: "MONTHLY",
    amountCents: 1599,
    chargeCurrency: "USD",
    chargeAmountMinor: 1599,
  });
  return repo.update(order.id, { status: "PAID" });
}

before(async () => {
  directory = await mkdtemp(join(tmpdir(), "rdpm-provision-"));
  process.env.DATABASE_PATH = join(directory, "fixture.db");
  process.env.APP_SECRET = SECRET;
  repo = new OrderRepository(await getDatabase());
});

beforeEach(async () => {
  await (await getDatabase()).prepare("DELETE FROM orders").all();
});

after(async () => {
  await rm(directory, { recursive: true, force: true });
});

test("does nothing while provisioning is disabled", async () => {
  const order = await paidOrder();
  let creates = 0;
  const result = await runProvisionFlow({ ...env, PROVISIONING_ENABLED: "false" }, order.id, {
    repo,
    create: async () => {
      creates += 1;
      return { data: { id: "srv_1" } };
    },
    getServer: async () => server("ACTIVE"),
    getCredentials: async () => ({ user: "Administrator", password: "x" }),
    encrypt: (plain) => plain,
    step: immediateStep(),
  });
  assert.equal(result, "disabled");
  assert.equal(creates, 0);
  assert.equal((await repo.byId(order.id))?.status, "PAID");
});

test("claims before creating, then persists the service, status and encrypted credentials", async () => {
  const order = await paidOrder();
  let creates = 0;
  let statusAtCreate: string | undefined;

  const result = await runProvisionFlow(env, order.id, {
    repo,
    create: async (_payload, _auth: SupplierAuth) => {
      creates += 1;
      statusAtCreate = (await repo.byId(order.id))?.status;
      return { data: { id: "srv_1" } };
    },
    getServer: async () => server("ACTIVE"),
    getCredentials: async () => ({ user: "Administrator", password: "s3cret" }),
    encrypt: encryptSecret,
    step: immediateStep(),
    pollAttempts: 1,
    pollDelay: "0 seconds",
  });

  assert.equal(result, "active");
  assert.equal(creates, 1);
  assert.equal(statusAtCreate, "PROVISIONING", "intent must be claimed before the billable call");

  const stored = await repo.byId(order.id);
  assert.equal(stored?.status, "ACTIVE");
  assert.equal(stored?.service_id, "srv_1");
  assert.equal(stored?.primary_ip, "203.0.113.10");
  assert.equal(stored?.username, "Administrator");
  assert.equal(decryptSecret(stored?.password_enc ?? "", SECRET), "s3cret");

  // A second dispatch cannot create again.
  const second = await runProvisionFlow(env, order.id, {
    repo,
    create: async () => {
      creates += 1;
      return { data: { id: "srv_2" } };
    },
    getServer: async () => server("ACTIVE"),
    getCredentials: async () => ({ user: "Administrator", password: "x" }),
    encrypt: (plain) => plain,
    step: immediateStep(),
  });
  assert.equal(second, "skipped");
  assert.equal(creates, 1);
});

test("a definite supplier rejection marks the order FAILED", async () => {
  const order = await paidOrder();
  const result = await runProvisionFlow(env, order.id, {
    repo,
    create: async () => {
      throw Object.assign(new Error("bad request"), { status: 400 });
    },
    getServer: async () => server("ACTIVE"),
    getCredentials: async () => ({ user: "Administrator", password: "x" }),
    encrypt: (plain) => plain,
    step: immediateStep(),
  });
  assert.equal(result, "failed");
  const stored = await repo.byId(order.id);
  assert.equal(stored?.status, "FAILED");
  assert.match(stored?.error ?? "", /rejected/i);
});

test("an uncertain outcome requires review and is never retried", async () => {
  const order = await paidOrder();
  let creates = 0;
  const result = await runProvisionFlow(env, order.id, {
    repo,
    create: async () => {
      creates += 1;
      throw Object.assign(new Error("upstream"), { status: 503 });
    },
    getServer: async () => server("ACTIVE"),
    getCredentials: async () => ({ user: "Administrator", password: "x" }),
    encrypt: (plain) => plain,
    step: immediateStep(),
  });
  assert.equal(result, "review_required");
  assert.equal(creates, 1);
  const stored = await repo.byId(order.id);
  assert.equal(stored?.status, "REVIEW_REQUIRED");
  assert.match(stored?.error ?? "", /uncertain/i);
});

test("insufficient supplier credit is reported as a failed order", async () => {
  const order = await paidOrder();
  const result = await runProvisionFlow(env, order.id, {
    repo,
    create: async () => {
      throw Object.assign(new Error("payment required"), { status: 402 });
    },
    getServer: async () => server("ACTIVE"),
    getCredentials: async () => ({ user: "Administrator", password: "x" }),
    encrypt: (plain) => plain,
    step: immediateStep(),
  });
  assert.equal(result, "failed");
  const stored = await repo.byId(order.id);
  assert.equal(stored?.status, "FAILED");
  assert.match(stored?.error ?? "", /credit is insufficient/i);
});

test("a server still provisioning is left for reconciliation and stores no credentials", async () => {
  const order = await paidOrder();
  let credentialFetches = 0;
  const result = await runProvisionFlow(env, order.id, {
    repo,
    create: async () => ({ data: { id: "srv_1" } }),
    getServer: async () => server("INSTALLING", "203.0.113.11"),
    getCredentials: async () => {
      credentialFetches += 1;
      return { user: "Administrator", password: "x" };
    },
    encrypt: (plain) => plain,
    step: immediateStep(),
    pollAttempts: 2,
    pollDelay: "0 seconds",
  });
  assert.equal(result, "provisioning");
  assert.equal(credentialFetches, 0);
  const stored = await repo.byId(order.id);
  assert.equal(stored?.status, "PROVISIONING");
  assert.equal(stored?.service_id, "srv_1");
  assert.equal(stored?.password_enc, null);
});

test("the provisioning claim is conditional and cannot be won twice", async () => {
  const order = await paidOrder();
  assert.ok(await repo.claimProvision(order.id));
  assert.equal(await repo.claimProvision(order.id), null);
});
