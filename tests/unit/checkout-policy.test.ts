import { test } from "node:test";
import assert from "node:assert/strict";
import { checkoutEnabled } from "../../src/lib/checkout-policy";

test("production checkout stays closed even when the master switch is on", () => {
  assert.equal(checkoutEnabled("cloudflare-production"), false);
  assert.equal(checkoutEnabled("cloudflare-staging"), true);
  assert.equal(checkoutEnabled("local"), true);
});

test("the deployment target is read at call time on the server", () => {
  const original = process.env.DEPLOYMENT_TARGET;
  try {
    delete process.env.DEPLOYMENT_TARGET;
    assert.equal(checkoutEnabled(), true);
    process.env.DEPLOYMENT_TARGET = "cloudflare-production";
    assert.equal(checkoutEnabled(), false);
  } finally {
    if (original === undefined) delete process.env.DEPLOYMENT_TARGET;
    else process.env.DEPLOYMENT_TARGET = original;
  }
});
