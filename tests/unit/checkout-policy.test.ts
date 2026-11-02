import { test } from "node:test";
import assert from "node:assert/strict";
import { checkoutEnabled } from "../../src/lib/checkout-policy";
import { CHECKOUT_AVAILABLE } from "../../src/lib/checkout-config";

test("checkout follows the master switch in every environment", () => {
  assert.equal(CHECKOUT_AVAILABLE, true);
  assert.equal(checkoutEnabled(), true);
});

test("the removed production guard cannot be reintroduced by deployment target", () => {
  const original = process.env.DEPLOYMENT_TARGET;
  try {
    process.env.DEPLOYMENT_TARGET = "cloudflare-production";
    assert.equal(checkoutEnabled(), true);
  } finally {
    if (original === undefined) delete process.env.DEPLOYMENT_TARGET;
    else process.env.DEPLOYMENT_TARGET = original;
  }
});
