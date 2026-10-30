import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { createCheckout, toMinorUnits, verifyZenoWebhook } from "../../src/lib/zenobank";

const signingKey = "fixture-zeno-signing-key";
const secret = `whsec_${Buffer.from(signingKey).toString("base64")}`;
const now = () => Math.floor(Date.now() / 1000);

function signature(body: string, id = "msg_fixture", timestamp = now()): string {
  return createHmac("sha256", Buffer.from(signingKey))
    .update(`${id}.${timestamp}.${body}`)
    .digest("base64");
}

function headers(
  body: string,
  options: { id?: string; timestamp?: number; raw?: string } = {},
): Headers {
  const id = options.id ?? "msg_fixture";
  const timestamp = options.timestamp ?? now();
  return new Headers({
    "svix-id": id,
    "svix-timestamp": String(timestamp),
    "svix-signature": options.raw ?? `v1,${signature(body, id, timestamp)}`,
  });
}

test("zeno checkout posts the documented contract", async () => {
  process.env.ZENO_API_KEY = "sk_fixture";
  process.env.ZENO_BASE_URL = "https://zfixture.test/";
  const original = globalThis.fetch;
  let seen: { url: string; init: RequestInit } | undefined;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    seen = { url: String(input), init: init ?? {} };
    return Response.json({
      id: "ch_fixture",
      orderId: "42",
      priceCurrency: "NGN",
      priceAmount: "25000.00",
      status: "OPEN",
      expiresAt: "2026-01-01T00:00:00Z",
      checkoutUrl: "https://pay.zenobank.io/ch_fixture",
      createdAt: "2026-01-01T00:00:00Z",
      successRedirectUrl: null,
    });
  }) as typeof fetch;
  try {
    const checkout = await createCheckout({
      orderId: "42",
      priceAmount: "25000.00",
      priceCurrency: "NGN",
      successRedirectUrl: "https://shop.test/success",
    });
    assert.equal(seen?.url, "https://zfixture.test/api/v1/checkouts");
    const sent = seen?.init.headers as Record<string, string>;
    assert.equal(sent["X-API-Key"], "sk_fixture");
    assert.equal(sent["Content-Type"], "application/json");
    assert.deepEqual(JSON.parse(String(seen?.init.body)), {
      orderId: "42",
      priceAmount: "25000.00",
      priceCurrency: "NGN",
      successRedirectUrl: "https://shop.test/success",
    });
    assert.equal(checkout.id, "ch_fixture");
  } finally {
    globalThis.fetch = original;
    delete process.env.ZENO_API_KEY;
    delete process.env.ZENO_BASE_URL;
  }
});

test("svix verification accepts valid and multi-signature headers", async () => {
  const body = JSON.stringify({ type: "checkout.completed", data: {} });
  const timestamp = now();
  assert.equal(await verifyZenoWebhook(body, headers(body, { timestamp }), secret), true);

  const multi = new Headers({
    "svix-id": "msg_fixture",
    "svix-timestamp": String(timestamp),
    "svix-signature": `v1,AAAA v1,${signature(body, "msg_fixture", timestamp)}`,
  });
  assert.equal(await verifyZenoWebhook(body, multi, secret), true);
});

test("svix verification rejects tampering, stale timestamps and missing headers", async () => {
  const body = JSON.stringify({ type: "checkout.completed", data: {} });
  assert.equal(await verifyZenoWebhook(body + " ", headers(body), secret), false);
  assert.equal(await verifyZenoWebhook(body, headers(body, { timestamp: 100 }), secret), false);
  assert.equal(await verifyZenoWebhook(body, new Headers(), secret), false);
  assert.equal(await verifyZenoWebhook(body, headers(body), ""), false);
});

test("minor-unit conversion is exact and rejects sub-cent precision", () => {
  assert.equal(toMinorUnits("15.99"), 1599);
  assert.equal(toMinorUnits("25000.00"), 2_500_000);
  assert.equal(toMinorUnits("100"), 10_000);
  assert.throws(() => toMinorUnits("1.234"));
  assert.throws(() => toMinorUnits("abc"));
});
