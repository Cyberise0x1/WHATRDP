import { after, afterEach, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { CheckoutError, createOrderCheckout, formatAmount } from "../../src/lib/checkout";
import { OrderRepository } from "../../src/lib/storage/repository";
import { getDatabase } from "../../src/lib/database";

// Fixture-only values. Nothing here reaches a real supplier or gateway.
process.env.RDP_MONSTER_API_TOKEN = "fixture_not_a_real_token";
process.env.ZENO_API_KEY = "sk_fixture";
process.env.ZENO_BASE_URL = "https://zeno.fixture";

const catalog = {
  products: [{ slug: "windows-rdp", name: "Windows", family: "WINDOWS" }],
  regions: [{ slug: "europe", name: "Europe" }],
  resellerTier: { discountPercent: 15 },
  resellerProducts: [],
  os: [
    { slug: "windows-2022", name: "Windows Server 2022", family: "WINDOWS" },
    { slug: "ubuntu-24-04", name: "Ubuntu 24.04", family: "LINUX" },
  ],
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

let directory: string;
let repo: OrderRepository;
let zenoCalls: { body: Record<string, unknown> }[] = [];
let orderExistedAtGatewayCall = false;
let originalFetch: typeof fetch;

function stubGateway(
  options: { fail?: boolean; balanceCents?: number; accountFails?: boolean } = {},
) {
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.includes("/account")) {
      if (options.accountFails) return new Response("upstream error", { status: 500 });
      return Response.json({
        data: {
          email: "fixture@example.com",
          balanceCents: options.balanceCents ?? 100_000,
          activeServices: 0,
          unpaidInvoices: 0,
          unpaidCents: 0,
          reseller: { tier: "bronze", discountPercent: 15, turnover30dCents: 0 },
          rateLimitPerMinute: 120,
        },
      });
    }
    if (url.includes("turnstile.fixture")) {
      const params = new URLSearchParams(String(init?.body ?? ""));
      const good = params.get("response") === "valid-token";
      return Response.json({
        success: good,
        "error-codes": good ? [] : ["invalid-input-response"],
      });
    }
    if (url.includes("dashboard.rdp.monster")) {
      return Response.json({ data: catalog });
    }
    if (url.includes("zeno.fixture")) {
      const body = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
      zenoCalls.push({ body });
      const orderId = Number(body.orderId);
      orderExistedAtGatewayCall = Boolean(await repo.byId(orderId));
      if (options.fail) return new Response("upstream error", { status: 500 });
      return Response.json({
        id: "ch_fixture",
        orderId: String(body.orderId),
        priceCurrency: body.priceCurrency,
        priceAmount: body.priceAmount,
        status: "OPEN",
        expiresAt: "2026-01-01T00:00:00Z",
        checkoutUrl: "https://pay.zeno.fixture/ch_fixture",
        createdAt: "2026-01-01T00:00:00Z",
        successRedirectUrl: body.successRedirectUrl ?? null,
      });
    }
    throw new Error(`Unexpected external request: ${url}`);
  }) as typeof fetch;
}

before(async () => {
  directory = await mkdtemp(join(tmpdir(), "rdpm-checkout-"));
  process.env.DATABASE_PATH = join(directory, "fixture.db");
  repo = new OrderRepository(await getDatabase());
  originalFetch = globalThis.fetch;
});

beforeEach(async () => {
  zenoCalls = [];
  orderExistedAtGatewayCall = false;
  delete process.env.SUPPLIER_RESERVE_CENTS;
  delete process.env.TURNSTILE_SECRET_KEY;
  delete process.env.TURNSTILE_BASE_URL;
  await (await getDatabase()).prepare("DELETE FROM orders").all();
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

after(async () => {
  await rm(directory, { recursive: true, force: true });
});

test("persists the order before the gateway call and returns the hosted checkout", async () => {
  stubGateway();
  const result = await createOrderCheckout(
    { sku: "europe/1", os: "windows-2022", cycle: "MONTHLY", email: " Buyer@Example.COM " },
    { origin: "https://whatrdp.com/" },
  );

  assert.match(result.token, /^[\w-]+$/);
  assert.equal(result.checkoutUrl, "https://pay.zeno.fixture/ch_fixture");
  assert.equal(orderExistedAtGatewayCall, true, "order must exist before the gateway call");

  const order = await repo.byPaymentReference("ch_fixture");
  assert.ok(order);
  assert.equal(order?.token, result.token);
  assert.equal(order?.status, "PENDING_PAYMENT");
  assert.equal(order?.amount_cents, 1599);
  assert.equal(order?.charge_currency, "USD");
  assert.equal(order?.charge_amount_minor, 1599);
  assert.equal(order?.email, "buyer@example.com");

  assert.deepEqual(zenoCalls[0].body, {
    orderId: String(order?.id),
    priceAmount: "15.99",
    priceCurrency: "USD",
    successRedirectUrl: `https://whatrdp.com/order/${result.token}`,
  });
});

test("rejects malformed input before catalogue, persistence or the gateway", async () => {
  stubGateway();
  const cases: { payload: unknown; code: string }[] = [
    { payload: null, code: "invalid_request" },
    { payload: [], code: "invalid_request" },
    { payload: { sku: "", os: "windows-2022", cycle: "MONTHLY" }, code: "invalid_sku" },
    { payload: { sku: "europe/1", os: "", cycle: "MONTHLY" }, code: "invalid_os" },
    { payload: { sku: "europe/1", os: "windows-2022", cycle: "WEEKLY" }, code: "invalid_cycle" },
    {
      payload: { sku: "europe/1", os: "windows-2022", cycle: "MONTHLY", currency: "EUR" },
      code: "currency_not_supported",
    },
    {
      payload: { sku: "europe/1", os: "windows-2022", cycle: "MONTHLY", email: "nope" },
      code: "invalid_email",
    },
  ];

  for (const { payload, code } of cases) {
    await assert.rejects(
      createOrderCheckout(payload, { origin: "https://whatrdp.com" }),
      (error: unknown) => error instanceof CheckoutError && error.code === code,
    );
  }
  assert.equal((await repo.recent()).length, 0);
  assert.equal(zenoCalls.length, 0);
});

test("rejects plans and operating systems that the catalogue does not offer", async () => {
  stubGateway();
  await assert.rejects(
    createOrderCheckout({ sku: "mars/999", os: "windows-2022", cycle: "MONTHLY" }),
    (error: unknown) => error instanceof CheckoutError && error.code === "unknown_plan",
  );
  await assert.rejects(
    createOrderCheckout({ sku: "europe/1", os: "plan9", cycle: "MONTHLY" }),
    (error: unknown) => error instanceof CheckoutError && error.code === "unknown_os",
  );
  assert.equal((await repo.recent()).length, 0);
  assert.equal(zenoCalls.length, 0);
});

test("a failed gateway call leaves an order that can never settle", async () => {
  stubGateway({ fail: true });
  await assert.rejects(
    createOrderCheckout({ sku: "europe/1", os: "windows-2022", cycle: "ANNUALLY" }),
    (error: unknown) =>
      error instanceof CheckoutError &&
      error.code === "gateway_unavailable" &&
      error.status === 502,
  );

  const [order] = await repo.recent();
  assert.equal(order.status, "PENDING_PAYMENT");
  assert.equal(order.payment_reference, null);
  assert.equal(order.amount_cents, 15299);
  assert.match(order.error ?? "", /No payment was taken/);
});

test("amounts are rendered as exact decimal strings", () => {
  assert.equal(formatAmount(1599), "15.99");
  assert.equal(formatAmount(2_500_000), "25000.00");
  assert.equal(formatAmount(99), "0.99");
  for (const invalid of [0, -1, 12.5, Number.NaN]) {
    assert.throws(() => formatAmount(invalid), CheckoutError);
  }
});

test("a low supplier balance blocks checkout before any order or payment", async () => {
  stubGateway({ balanceCents: 100 });
  await assert.rejects(
    createOrderCheckout({ sku: "europe/1", os: "windows-2022", cycle: "MONTHLY" }),
    (error: unknown) =>
      error instanceof CheckoutError &&
      error.code === "insufficient_supplier_balance" &&
      error.status === 503,
  );
  assert.equal((await repo.recent()).length, 0);
  assert.equal(zenoCalls.length, 0);
});

test("the renewal reserve is added to the required supplier balance", async () => {
  process.env.SUPPLIER_RESERVE_CENTS = "5000";
  // Supplier cost is 764; this balance covers the order but not the reserve.
  stubGateway({ balanceCents: 1000 });
  await assert.rejects(
    createOrderCheckout({ sku: "europe/1", os: "windows-2022", cycle: "MONTHLY" }),
    (error: unknown) =>
      error instanceof CheckoutError && error.code === "insufficient_supplier_balance",
  );
  assert.equal((await repo.recent()).length, 0);
  assert.equal(zenoCalls.length, 0);
});

test("an unverifiable supplier balance fails closed", async () => {
  stubGateway({ accountFails: true });
  await assert.rejects(
    createOrderCheckout({ sku: "europe/1", os: "windows-2022", cycle: "MONTHLY" }),
    (error: unknown) =>
      error instanceof CheckoutError && error.code === "supplier_balance_unavailable",
  );
  assert.equal((await repo.recent()).length, 0);
  assert.equal(zenoCalls.length, 0);
});

test("a sufficient balance and reserve still creates the order", async () => {
  process.env.SUPPLIER_RESERVE_CENTS = "5000";
  stubGateway({ balanceCents: 6000 });
  const result = await createOrderCheckout({
    sku: "europe/1",
    os: "windows-2022",
    cycle: "MONTHLY",
  });
  assert.match(result.token, /^[\w-]+$/);
  assert.equal(zenoCalls.length, 1);
});

test("Turnstile is enforced only when configured, and requires a token", async () => {
  process.env.TURNSTILE_SECRET_KEY = "fixture_secret";
  process.env.TURNSTILE_BASE_URL = "https://turnstile.fixture";
  stubGateway();

  await assert.rejects(
    createOrderCheckout({ sku: "europe/1", os: "windows-2022", cycle: "MONTHLY" }),
    (error: unknown) => error instanceof CheckoutError && error.code === "turnstile_required",
  );
  await assert.rejects(
    createOrderCheckout({
      sku: "europe/1",
      os: "windows-2022",
      cycle: "MONTHLY",
      turnstileToken: "bad-token",
    }),
    (error: unknown) => error instanceof CheckoutError && error.code === "turnstile_failed",
  );

  assert.equal((await repo.recent()).length, 0);
  assert.equal(zenoCalls.length, 0);
});

test("a valid Turnstile token allows checkout", async () => {
  process.env.TURNSTILE_SECRET_KEY = "fixture_secret";
  process.env.TURNSTILE_BASE_URL = "https://turnstile.fixture";
  stubGateway();

  const result = await createOrderCheckout({
    sku: "europe/1",
    os: "windows-2022",
    cycle: "MONTHLY",
    turnstileToken: "valid-token",
  });
  assert.match(result.token, /^[\w-]+$/);
  assert.equal(zenoCalls.length, 1);
});
