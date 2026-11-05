import { after, afterEach, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { performPowerAction } from "../../src/lib/order-actions";
import { powerStateIsFresh, refreshOrderState } from "../../src/lib/orders";
import { POWER_REFRESH_INTERVAL_MS } from "../../src/lib/power-actions";
import { encryptSecret } from "../../src/lib/crypto";
import { resetAlertThrottle } from "../../src/lib/alerts";
import { OrderRepository } from "../../src/lib/storage/repository";
import { getDatabase } from "../../src/lib/database";
import type { Server } from "../../src/lib/rdpmonster";

process.env.RDP_MONSTER_API_TOKEN = "fixture_not_a_real_token";
process.env.APP_SECRET = "fixture_app_secret_at_least_16";

let directory: string;
let repo: OrderRepository;
let calls: { url: string; method: string; body: string | null }[] = [];
let originalFetch: typeof fetch;

function server(power = "RUNNING"): Server {
  return {
    id: "srv_1",
    label: "web-fixture",
    status: "ACTIVE",
    power,
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

function stubSupplier(
  options: {
    actionStatus?: number;
    actionBody?: unknown;
    serverPower?: string;
    serverStatus?: number;
  } = {},
) {
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = (init?.method ?? "GET").toUpperCase();
    calls.push({ url, method, body: init?.body ? String(init.body) : null });

    if (url.endsWith("/servers/srv_1/actions")) {
      if ((options.actionStatus ?? 200) >= 400) {
        return Response.json(options.actionBody ?? { error: "not_found" }, {
          status: options.actionStatus,
        });
      }
      return Response.json({
        data: { id: "srv_1", action: JSON.parse(String(init?.body ?? "{}")).action, ok: true },
      });
    }
    if (url.endsWith("/servers/srv_1")) {
      if ((options.serverStatus ?? 200) >= 400) {
        return Response.json({ error: "server_error" }, { status: options.serverStatus });
      }
      return Response.json({ data: server(options.serverPower) });
    }
    throw new Error(`Unexpected external request: ${url}`);
  }) as typeof fetch;
}

async function makeActiveOrder() {
  const order = await repo.create({
    planSku: "europe/1",
    os: "windows-2022",
    cycle: "MONTHLY",
    amountCents: 1599,
  });
  await repo.update(order.id, { status: "ACTIVE", service_id: "srv_1" });
  const claimed = await repo.claimCredentials(
    order.id,
    "Administrator",
    encryptSecret("fixture-password"),
  );
  assert.ok(claimed);
  return claimed;
}

before(async () => {
  directory = await mkdtemp(join(tmpdir(), "rdpm-power-"));
  process.env.DATABASE_PATH = join(directory, "fixture.db");
  repo = new OrderRepository(await getDatabase());
  originalFetch = globalThis.fetch;
});

beforeEach(async () => {
  calls = [];
  const db = await getDatabase();
  await db.prepare("DELETE FROM orders").all();
  await db.prepare("DELETE FROM power_actions").all();
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

after(async () => {
  await rm(directory, { recursive: true, force: true });
});

test("rejects actions outside the allowlist without a supplier call", async () => {
  const order = await makeActiveOrder();
  const result = await performPowerAction(order.token, { action: "delete" });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.status, 400);
    assert.equal(result.error, "invalid_action");
  }
  assert.deepEqual(calls, []);
});

test("refuses power actions for an order that is not active", async () => {
  const order = await repo.create({
    planSku: "europe/1",
    os: "windows-2022",
    cycle: "MONTHLY",
    amountCents: 1599,
  });
  const result = await performPowerAction(order.token, { action: "start" });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.status, 409);
    assert.equal(result.error, "not_ready");
  }
  assert.deepEqual(calls, []);
});

test("sends an allowlisted action and returns the refreshed power state", async () => {
  const order = await makeActiveOrder();
  stubSupplier({ serverPower: "RUNNING" });

  const result = await performPowerAction(order.token, { action: "reboot" });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.power, "RUNNING");
    assert.equal(result.order.status, "ACTIVE");
  }

  const actionCalls = calls.filter((call) => call.url.endsWith("/servers/srv_1/actions"));
  assert.equal(actionCalls.length, 1);
  assert.equal(actionCalls[0].method, "POST");
  assert.deepEqual(JSON.parse(actionCalls[0].body ?? "{}"), { action: "reboot" });
  assert.equal(calls.filter((call) => call.method === "GET").length, 1);
});

test("power actions are rate limited per order and audited", async () => {
  const order = await makeActiveOrder();
  stubSupplier({ serverPower: "RUNNING" });

  const first = await performPowerAction(order.token, { action: "reboot" });
  assert.equal(first.ok, true);

  const db = await getDatabase();
  const audit = await db
    .prepare("SELECT action, outcome FROM power_actions WHERE order_id = ?")
    .bind(order.id)
    .all<{ action: string; outcome: string }>();
  assert.deepEqual(
    audit.results.map((row) => `${row.action}:${row.outcome}`),
    ["reboot:sent"],
  );

  const callsAfterFirst = calls.length;
  const limited = await performPowerAction(order.token, { action: "start" });
  assert.equal(limited.ok, false);
  if (!limited.ok) {
    assert.equal(limited.status, 429);
    assert.equal(limited.error, "rate_limited");
    assert.equal(limited.retryAfter, 10);
  }
  assert.equal(calls.length, callsAfterFirst, "a rate-limited action must not reach the supplier");

  await db
    .prepare("UPDATE power_actions SET created_at = ? WHERE order_id = ?")
    .bind(new Date(Date.now() - POWER_REFRESH_INTERVAL_MS - 1_000).toISOString(), order.id)
    .all();

  const retried = await performPowerAction(order.token, { action: "start" });
  assert.equal(retried.ok, true);
  const outcomes = await db
    .prepare("SELECT outcome FROM power_actions WHERE order_id = ? ORDER BY id")
    .bind(order.id)
    .all<{ outcome: string }>();
  assert.deepEqual(
    outcomes.results.map((row) => row.outcome),
    ["sent", "sent"],
  );
});

test("marks the order cancelled when the supplier reports the server missing", async () => {
  const order = await makeActiveOrder();
  stubSupplier({ actionStatus: 404, actionBody: { error: "not_found" } });

  const result = await performPowerAction(order.token, { action: "shutdown" });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.status, 409);
    assert.equal(result.error, "server_missing");
  }

  const stored = await repo.byId(order.id);
  assert.equal(stored?.status, "CANCELLED");
  assert.equal(stored?.primary_ip, null);
  assert.equal(stored?.username, null);
  assert.equal(stored?.password_enc, null);
  assert.match(stored?.error ?? "", /no longer available/i);
});

test("maps a supplier conflict without changing the order", async () => {
  const order = await makeActiveOrder();
  stubSupplier({ actionStatus: 409, actionBody: { error: "service_not_active" } });

  const result = await performPowerAction(order.token, { action: "start" });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.status, 409);
    assert.equal(result.error, "action_unavailable");
  }

  const stored = await repo.byId(order.id);
  assert.equal(stored?.status, "ACTIVE");
  assert.ok(stored?.password_enc);
});

test("a failed power action raises a WHATRDP alert carrying the platform error", async () => {
  const order = await makeActiveOrder();
  stubSupplier({ actionStatus: 500, actionBody: { error: "internal_error" } });

  const lines: string[] = [];
  const originalError = console.error;
  const originalWarn = console.warn;
  console.error = (...args: unknown[]) => {
    lines.push(args.map((value) => String(value)).join(" "));
  };
  console.warn = (...args: unknown[]) => {
    lines.push(args.map((value) => String(value)).join(" "));
  };
  resetAlertThrottle();
  try {
    const result = await performPowerAction(order.token, { action: "reboot" });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.status, 502);
      assert.equal(result.error, "action_failed");
    }

    const alert = lines
      .map((line) => {
        try {
          return JSON.parse(line) as {
            event?: string;
            code?: string;
            severity?: string;
            message?: string;
            context?: Record<string, unknown>;
          };
        } catch {
          return null;
        }
      })
      .find(
        (value) => value?.event === "operational_alert" && value.code === "power_action_failed",
      );
    assert.ok(alert, "a power_action_failed alert must be logged");
    assert.equal(alert.severity, "critical");
    assert.match(alert.message ?? "", /WHATRDP/);
    assert.deepEqual(alert.context, {
      orderId: order.id,
      action: "reboot",
      outcome: "failed",
      supplierStatus: 500,
      supplierCode: "internal_error",
    });
  } finally {
    console.error = originalError;
    console.warn = originalWarn;
    globalThis.fetch = originalFetch;
  }
});

test("default reads stay local and forced reads return live power state", async () => {
  const order = await makeActiveOrder();
  stubSupplier({ serverPower: "STOPPED" });

  const cached = await refreshOrderState(order);
  assert.equal(cached.power, null);
  assert.equal(calls.length, 0);

  const fresh = await refreshOrderState(order, true);
  assert.equal(fresh.power, "STOPPED");
  assert.equal(fresh.order.power_state, "STOPPED");
  assert.ok(fresh.order.power_checked_at);
  assert.equal(powerStateIsFresh(fresh.order), true);
  assert.equal(powerStateIsFresh(fresh.order, Date.now() + POWER_REFRESH_INTERVAL_MS + 1), false);
  assert.equal(calls.filter((call) => call.method === "GET").length, 1);
});

test("a failed forced refresh keeps a live order unchanged", async () => {
  const order = await makeActiveOrder();
  stubSupplier({ serverStatus: 400 });

  const result = await refreshOrderState(order, true, { recordError: false });
  assert.equal(result.power, null);
  assert.equal(result.order.error, null);

  const stored = await repo.byId(order.id);
  assert.equal(stored?.status, "ACTIVE");
  assert.equal(stored?.error, null);
});
