import { after, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { readFile, mkdtemp, rm, stat } from "node:fs/promises";
import { readdirSync, statSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolve } from "node:path";
import { Miniflare } from "miniflare";
import { OrderRepository } from "../../src/lib/storage/repository";
import { acceptVerifiedPayment } from "../../src/lib/payments";
import { runProvisioning } from "../../src/lib/provisioning";
import { encryptSecret, decryptSecret } from "../../src/lib/crypto";
import type { SqlDatabase, SqlStatement } from "../../src/lib/storage/types";
import type { Server } from "../../src/lib/rdpmonster";
import { SCHEMA } from "../../src/lib/storage/schema";
import { exportOrders } from "../../scripts/export-orders";

// Deliberately fake values. No test reads the reseller's real credentials.
const APP_SECRET = "fixture-only-key-never-use-for-real-data";
process.env.APP_SECRET = APP_SECRET;
const providerSecret = "fixture_provider_signing";
const zenoSigningKey = "fixture-zeno-signing-key";
const zenoSecret = `whsec_${Buffer.from(zenoSigningKey).toString("base64")}`;
let mf: Miniflare;
let repo: OrderRepository;
let db: SqlDatabase;
let externalCalls: string[] = [];

const catalog = {
  products: [{ slug: "windows-rdp", name: "Windows", family: "WINDOWS" }],
  regions: [{ slug: "europe", name: "Europe" }],
  resellerTier: { discountPercent: 15 },
  resellerProducts: [],
  os: [{ slug: "windows-2022", name: "Windows Server 2022", family: "WINDOWS" }],
  plans: [
    {
      sku: "europe/1",
      name: "Basic",
      product: "windows-rdp",
      region: "europe",
      tier: "CLASSIC",
      cpuCores: 2,
      ramMb: 6144,
      diskGb: 40,
      ipv4Count: 1,
      priceCents: { MONTHLY: 899, ANNUALLY: 8988 },
    },
  ],
};

function options() {
  const buildRoot = "generated-artifacts/worker-fixture";
  const modules = [
    { type: "ESModule" as const, path: resolve(buildRoot, "worker-fixture.js") },
    ...readdirSync(buildRoot, { recursive: true })
      .map(String)
      .filter(
        (p) =>
          p !== "worker-fixture.js" &&
          /\.(mjs|cjs|js|wasm)$/.test(p) &&
          statSync(resolve(buildRoot, p)).isFile(),
      )
      .map((p) => ({
        type: p.endsWith(".wasm")
          ? ("CompiledWasm" as const)
          : p.endsWith(".cjs")
            ? ("CommonJS" as const)
            : ("ESModule" as const),
        path: resolve(buildRoot, p),
      })),
  ];
  return {
    // Run Wrangler's final bundle, including its Node-compat require shim.
    modules,
    modulesRoot: resolve(buildRoot),
    compatibilityDate: "2026-07-01",
    compatibilityFlags: ["nodejs_compat", "global_fetch_strictly_public"],
    assets: {
      directory: resolve(".open-next/assets"),
      binding: "ASSETS",
      routerConfig: { has_user_worker: true, invoke_user_worker_ahead_of_assets: true },
    },
    d1Databases: { DB: "disposable-fixture-db" },
    bindings: {
      APP_SECRET,
      RDPM_WEBHOOK_SECRET: providerSecret,
      ZENO_WEBHOOK_SECRET: zenoSecret,
      RDP_MONSTER_API_TOKEN: "fixture_not_a_real_token",
      PROVISIONING_ENABLED: "false",
      DEPLOYMENT_TARGET: "cloudflare-staging",
    },
    outboundService: async (request: Request) => {
      const url = new URL(request.url);
      externalCalls.push(`${request.method} ${url.hostname}${url.pathname}`);
      if (url.hostname === "dashboard.rdp.monster") {
        if (url.pathname.endsWith("/catalog")) return Response.json({ data: catalog });
        if (url.pathname.endsWith("/servers/srv_fixture/actions")) {
          assert.equal(((await request.json()) as { action: string }).action, "credentials");
          return Response.json({
            data: { user: "Administrator", password: "fixture-server-password" },
          });
        }
        if (url.pathname.endsWith("/servers/srv_fixture"))
          return Response.json({
            data: {
              id: "srv_fixture",
              status: "ACTIVE",
              ips: [{ address: "192.0.2.10", primary: true }],
            },
          });
      }
      // No test may reach a live gateway/provider or create a paid VM.
      throw new Error(
        `Unexpected external test request: ${request.method} ${url.hostname}${url.pathname}`,
      );
    },
  };
}

async function sql<T>(statement: string, values: unknown[] = [], method = "first"): Promise<T> {
  const response = await mf.dispatchFetch("https://fixture.test/__fixture/sql", {
    method: "POST",
    body: JSON.stringify({ sql: statement, values, method }),
  });
  assert.equal(response.status, 200, await response.clone().text());
  return response.json() as Promise<T>;
}

function httpDatabase(): SqlDatabase {
  return {
    prepare(statement) {
      let values: unknown[] = [];
      const query: SqlStatement = {
        bind(...args) {
          values = args;
          return query;
        },
        first<T>() {
          return sql<T | null>(statement, values);
        },
        all<T>() {
          return sql<{ results: T[] }>(statement, values, "all");
        },
      };
      return query;
    },
  };
}

async function makeOrder() {
  const order = await repo.create({
    planSku: "europe/1",
    os: "windows-2022",
    cycle: "MONTHLY",
    amountCents: 1599,
  });
  return repo.update(order.id, { payment_reference: "payment_fixture" });
}

function signedProvider(body: string, timestamp = String(Math.floor(Date.now() / 1000))) {
  return {
    "x-rdpm-timestamp": timestamp,
    "x-rdpm-signature":
      "v1=" + createHmac("sha256", providerSecret).update(`${timestamp}.${body}`).digest("hex"),
  };
}

function signedZeno(body: string, id: string, timestamp = String(Math.floor(Date.now() / 1000))) {
  return {
    "svix-id": id,
    "svix-timestamp": timestamp,
    "svix-signature":
      "v1," +
      createHmac("sha256", Buffer.from(zenoSigningKey))
        .update(`${id}.${timestamp}.${body}`)
        .digest("base64"),
  };
}

before(
  async () => {
    mf = new Miniflare(options());
    await mf.ready;
    db = httpDatabase();
    repo = new OrderRepository(db);
    for (const file of readdirSync("migrations")
      .filter((p) => p.endsWith(".sql"))
      .sort()) {
      const migration = await readFile(resolve("migrations", file), "utf8");
      for (const statement of migration
        .replace(/--[^\n]*/g, "")
        .split(";")
        .filter((s) => s.trim())) {
        await sql(statement, [], "run");
      }
    }
  },
  { timeout: 45000 },
);

beforeEach(async () => {
  await sql("DELETE FROM orders", [], "run");
  externalCalls = [];
});
after(async () => {
  await mf?.dispose();
});

test("real Workers runtime serves Next.js SSR and catalogue API", async () => {
  const page = await mf.dispatchFetch("https://fixture.test/");
  assert.equal(page.status, 200);
  assert.match(await page.text(), /Basic/);
  const response = await mf.dispatchFetch("https://fixture.test/api/catalog");
  assert.equal(response.status, 200);
  const body = (await response.json()) as { data: { sku: string }[] };
  assert.equal(body.data[0].sku, "europe/1");
});

test("disabled checkout cannot create orders, call a gateway, or provision", async () => {
  for (const body of [
    "{",
    "null",
    JSON.stringify({ sku: 12, os: [] }),
    JSON.stringify({ sku: "europe/1", os: "windows-2022", cycle: "MONTHLY" }),
  ]) {
    const bad = await mf.dispatchFetch("https://fixture.test/api/checkout", {
      method: "POST",
      body,
    });
    assert.equal(bad.status, 503);
    assert.equal(((await bad.json()) as { error: string }).error, "payments_not_configured");
  }
  assert.equal((await repo.recent()).length, 0);
  assert.deepEqual(externalCalls, []);
});

test("parallel payment delivery has exactly one durable winner", async () => {
  const order = await makeOrder();
  const payment = {
    reference: "payment_fixture",
    paid: true,
    amount: order.amount_cents,
    currency: "USD",
    orderId: order.id,
    orderToken: order.token,
  };
  const results = await Promise.all(
    Array.from({ length: 15 }, () => acceptVerifiedPayment(repo, payment)),
  );
  assert.equal(results.filter((r) => r.kind === "paid").length, 1);
  assert.equal(results.filter((r) => r.kind === "duplicate").length, 14);
});

test("internal payment seam matches amount, currency, ownership and settlement", async () => {
  const order = await makeOrder();
  const good = {
    reference: "payment_fixture",
    paid: true,
    amount: order.amount_cents,
    currency: "USD",
    orderId: order.id,
    orderToken: order.token,
  };
  for (const patch of [
    { paid: false },
    { amount: 1 },
    { currency: "NGN" },
    { orderId: 9999 },
    { orderToken: "wrong-token" },
  ]) {
    assert.equal((await acceptVerifiedPayment(repo, { ...good, ...patch })).kind, "mismatch");
    assert.equal((await repo.byId(order.id))?.status, "PENDING_PAYMENT");
  }
  assert.equal(
    (await acceptVerifiedPayment(repo, { ...good, reference: "unknown" })).kind,
    "unknown",
  );
  assert.equal((await acceptVerifiedPayment(repo, good)).kind, "paid");
  assert.equal((await acceptVerifiedPayment(repo, good)).kind, "duplicate");
  assert.equal((await repo.byId(order.id))?.status, "PAID");
  assert.ok(!externalCalls.some((c) => c.endsWith("/servers")));
});

test("NGN is validated against the charged amount, not the USD cost basis", async () => {
  const order = await repo.create({
    planSku: "europe/1",
    os: "windows-2022",
    cycle: "MONTHLY",
    amountCents: 1599,
    chargeCurrency: "NGN",
    chargeAmountMinor: 2_500_000,
    fxRate: "1562.5",
  });
  await repo.update(order.id, { payment_reference: "payment_ngn" });
  const base = {
    reference: "payment_ngn",
    paid: true,
    orderId: order.id,
    orderToken: order.token,
  };
  // The USD cost basis must NOT settle an NGN charge, and neither may a wrong amount.
  assert.equal(
    (await acceptVerifiedPayment(repo, { ...base, amount: 1599, currency: "USD" })).kind,
    "mismatch",
  );
  assert.equal(
    (await acceptVerifiedPayment(repo, { ...base, amount: 2_500_000, currency: "USD" })).kind,
    "mismatch",
  );
  assert.equal(
    (await acceptVerifiedPayment(repo, { ...base, amount: 2_500_000, currency: "NGN" })).kind,
    "paid",
  );

  const response = await mf.dispatchFetch(`https://fixture.test/api/orders/${order.token}`);
  const body = (await response.json()) as {
    data: { currency: string; amountMinor: number; amountCents: number };
  };
  assert.equal(body.data.currency, "NGN");
  assert.equal(body.data.amountMinor, 2_500_000);
  assert.equal(body.data.amountCents, 1599);
});

test("parallel provisioning claims make at most one supplier creation call", async () => {
  const order = await makeOrder();
  await repo.update(order.id, { status: "PAID" });
  let creates = 0;
  const create = async (payload: Record<string, unknown>) => {
    creates++;
    assert.equal(payload.label, `web-${order.token}`);
    return { data: { id: "srv_fixture" } as Server };
  };
  await Promise.all(Array.from({ length: 15 }, () => runProvisioning(repo, order.id, create)));
  assert.equal(creates, 1);
  assert.equal((await repo.byId(order.id))?.service_id, "srv_fixture");
});

test("uncertain creation is held for review and never automatically resubmitted", async () => {
  const order = await makeOrder();
  await repo.update(order.id, { status: "PAID" });
  let attempts = 0;
  const fail = async () => {
    attempts++;
    throw new TypeError("simulated response lost after upstream charge");
  };
  await runProvisioning(repo, order.id, fail);
  await runProvisioning(repo, order.id, fail);
  assert.equal(attempts, 1);
  assert.equal((await repo.byId(order.id))?.status, "REVIEW_REQUIRED");
});

test("an interrupted durable claim cannot issue another creation request", async () => {
  const order = await makeOrder();
  await repo.update(order.id, { status: "PAID" });
  await repo.claimProvision(order.id);
  let attempts = 0;
  await runProvisioning(repo, order.id, async () => {
    attempts++;
    throw new Error("must not run");
  });
  assert.equal(attempts, 0);
});

test("encrypted source payload remains decryptable inside Workers and is not cached", async () => {
  const order = await makeOrder();
  const encrypted = encryptSecret("fixture-migration-password");
  await repo.update(order.id, {
    status: "ACTIVE",
    service_id: "srv_fixture",
    username: "Administrator",
    password_enc: encrypted,
  });
  const response = await mf.dispatchFetch(`https://fixture.test/api/orders/${order.token}`);
  assert.equal(response.status, 200, await response.clone().text());
  assert.match(response.headers.get("cache-control") ?? "", /no-store/);
  const body = (await response.json()) as { data: { credentials: { password: string } } };
  assert.equal(body.data.credentials.password, "fixture-migration-password");
  assert.equal((await repo.byId(order.id))?.password_enc, encrypted);
});

test("provider webhook rejects tampering/replays and fetches authoritative state", async () => {
  const order = await makeOrder();
  await repo.update(order.id, { status: "PROVISIONING", service_id: "srv_fixture" });
  const body = JSON.stringify({
    event: "server.created",
    data: { serviceId: "srv_fixture", ip: "forged-event-ip" },
  });
  const stale = await mf.dispatchFetch("https://fixture.test/api/webhooks/rdpmonster", {
    method: "POST",
    body,
    headers: signedProvider(body, "100"),
  });
  assert.equal(stale.status, 401);
  const tampered = await mf.dispatchFetch("https://fixture.test/api/webhooks/rdpmonster", {
    method: "POST",
    body: body + " ",
    headers: signedProvider(body),
  });
  assert.equal(tampered.status, 401);
  const valid = await mf.dispatchFetch("https://fixture.test/api/webhooks/rdpmonster", {
    method: "POST",
    body,
    headers: signedProvider(body),
  });
  assert.equal(valid.status, 200);
  const updated = await repo.byId(order.id);
  assert.equal(updated?.primary_ip, "192.0.2.10");
  assert.equal(updated?.status, "ACTIVE");
  assert.equal(decryptSecret(updated!.password_enc!), "fixture-server-password");
});

test("zeno webhook settles the charged amount and dedupes deliveries", async () => {
  const order = await repo.create({
    planSku: "europe/1",
    os: "windows-2022",
    cycle: "MONTHLY",
    amountCents: 1599,
    chargeCurrency: "USD",
    chargeAmountMinor: 1599,
  });
  await repo.update(order.id, { payment_reference: "ch_fixture" });
  const body = JSON.stringify({
    type: "checkout.completed",
    data: {
      id: "ch_fixture",
      orderId: String(order.id),
      priceCurrency: "USD",
      priceAmount: "15.99",
      paidAmount: "15.99",
      status: "COMPLETED",
      expiresAt: "x",
      checkoutUrl: "x",
      createdAt: "x",
      successRedirectUrl: null,
    },
  });
  const headers = signedZeno(body, "msg_completed");
  const first = await mf.dispatchFetch("https://fixture.test/api/webhooks/zenobank", {
    method: "POST",
    body,
    headers,
  });
  assert.equal(first.status, 200);
  assert.equal((await repo.byId(order.id))?.status, "PAID");

  // Replay of the same svix-id is acknowledged without a second claim.
  const replay = await mf.dispatchFetch("https://fixture.test/api/webhooks/zenobank", {
    method: "POST",
    body,
    headers,
  });
  assert.equal(replay.status, 200);

  const tampered = await mf.dispatchFetch("https://fixture.test/api/webhooks/zenobank", {
    method: "POST",
    body: body + " ",
    headers,
  });
  assert.equal(tampered.status, 401);
  assert.deepEqual(externalCalls, []);
});

test("zeno partial payment never settles or provisions", async () => {
  const order = await repo.create({
    planSku: "europe/1",
    os: "windows-2022",
    cycle: "MONTHLY",
    amountCents: 1599,
    chargeCurrency: "USD",
    chargeAmountMinor: 1599,
  });
  await repo.update(order.id, { payment_reference: "ch_partial" });
  const body = JSON.stringify({
    type: "checkout.partially_paid",
    data: {
      id: "ch_partial",
      orderId: String(order.id),
      priceCurrency: "USD",
      priceAmount: "15.99",
      paidAmount: "5.00",
      status: "PARTIALLY_PAID",
      expiresAt: "x",
      checkoutUrl: "x",
      createdAt: "x",
      successRedirectUrl: null,
    },
  });
  const response = await mf.dispatchFetch("https://fixture.test/api/webhooks/zenobank", {
    method: "POST",
    body,
    headers: signedZeno(body, "msg_partial"),
  });
  assert.equal(response.status, 200);
  assert.equal((await repo.byId(order.id))?.status, "PENDING_PAYMENT");
  assert.deepEqual(externalCalls, []);
});

test("unknown order links return 404 without exposing other orders", async () => {
  await makeOrder();
  assert.equal(
    (await mf.dispatchFetch("https://fixture.test/api/orders/not-a-real-token")).status,
    404,
  );
});

test("offline SQLite export round-trips through D1 without changing source or ciphertext", async () => {
  const temp = await mkdtemp(join(tmpdir(), "rdpm-source-fixture-"));
  const exportDir = await mkdtemp(resolve("generated-artifacts/export-fixture-"));
  const source = join(temp, "source-copy.db");
  const output = join(exportDir, "orders.sql");
  const native = new DatabaseSync(source);
  native.exec(SCHEMA);
  const encrypted = encryptSecret("fixture-offline-password");
  native
    .prepare(
      `INSERT INTO orders (id, token, plan_sku, os, cycle, amount_cents, status, password_enc, created_at, updated_at)
     VALUES (41, ?, 'europe/1', 'windows-2022', 'MONTHLY', 1599, 'ACTIVE', ?, ?, ?)`,
    )
    .run("fixture-export-token", encrypted, "2026-01-01", "2026-01-01");
  native.close();
  try {
    const beforeExport = await readFile(source);
    assert.equal(await exportOrders(source, output), 1);
    assert.deepEqual(await readFile(source), beforeExport);
    assert.equal((await stat(output)).mode & 0o777, 0o600);
    await assert.rejects(exportOrders(source, output), /EEXIST/);
    await assert.rejects(exportOrders(source, join(temp, "unsafe.sql")), /generated-artifacts/);
    const insert = await readFile(output, "utf8");
    await sql(insert, [], "run");
    const imported = await repo.byId(41);
    assert.equal(imported?.token, "fixture-export-token");
    assert.equal(imported?.password_enc, encrypted);
    assert.equal(decryptSecret(imported!.password_enc!), "fixture-offline-password");
    const created = await repo.create({
      planSku: "europe/1",
      os: "windows-2022",
      cycle: "MONTHLY",
      amountCents: 1599,
    });
    assert.ok(created.id > 41);
  } finally {
    await rm(temp, { recursive: true, force: true });
    await rm(exportDir, { recursive: true, force: true });
  }
});

test("public catalogue UI communicates unavailable checkout and disables buttons", async () => {
  const response = await mf.dispatchFetch("https://fixture.test/");
  const html = await response.text();
  assert.match(html, /Payments unavailable/);
  assert.match(html, /new orders are currently disabled/);
  assert.match(html, /disabled="" aria-describedby="checkout-status"/);
});
