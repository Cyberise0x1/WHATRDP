import { test } from "node:test";
import assert from "node:assert/strict";
import { classifySupplierEvent } from "../../src/lib/supplier-events";

test("provider events map to the right webhook action", () => {
  for (const event of [
    "server.created",
    "server.delivered",
    "server.renewed",
    "server.suspended",
    "server.deleted",
  ]) {
    assert.equal(classifySupplierEvent(event), "sync", event);
  }
  assert.equal(classifySupplierEvent("service.expiring"), "expiring");
  for (const event of ["invoice.created", "invoice.paid"]) {
    assert.equal(classifySupplierEvent(event), "invoice", event);
  }
  assert.equal(classifySupplierEvent("payment.failed"), "payment_failed");
  assert.equal(classifySupplierEvent("something.new"), "unknown");
  assert.equal(classifySupplierEvent(undefined), "unknown");
});
