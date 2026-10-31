import { test } from "node:test";
import assert from "node:assert/strict";
import { allowCheckout, clientKey, type RateLimiterBinding } from "../../src/lib/abuse";

function request(headers: Record<string, string>): Request {
  return new Request("https://whatrdp.test/api/checkout", { method: "POST", headers });
}

test("the limiter keys on the client IP, not the proxy chain", () => {
  assert.equal(clientKey(request({ "cf-connecting-ip": "203.0.113.4" })), "203.0.113.4");
  assert.equal(clientKey(request({ "x-forwarded-for": "198.51.100.7, 10.0.0.1" })), "198.51.100.7");
  assert.equal(clientKey(request({})), "unknown");
});

test("an absent binding allows checkout (Node dev and tests)", async () => {
  assert.equal(await allowCheckout(request({})), true);
});

test("an exhausted limiter denies checkout", async () => {
  const limiter: RateLimiterBinding = {
    limit: async (options) => {
      assert.equal(options.key, "203.0.113.4");
      return { success: false };
    },
  };
  assert.equal(await allowCheckout(request({ "cf-connecting-ip": "203.0.113.4" }), limiter), false);
});

test("a limiter error fails open rather than taking sales down", async () => {
  const limiter: RateLimiterBinding = {
    limit: async () => {
      throw new Error("binding unavailable");
    },
  };
  assert.equal(await allowCheckout(request({}), limiter), true);
});
