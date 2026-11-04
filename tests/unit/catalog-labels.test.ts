import assert from "node:assert/strict";
import test from "node:test";
import {
  regionCode,
  regionName,
  sortRegions,
  sortTiers,
  tierCode,
  tierName,
} from "../../src/lib/catalog-labels";

test("regions render as customer-facing names and codes", () => {
  assert.equal(regionName("europe"), "Europe");
  assert.equal(regionName("usa"), "United States");
  assert.equal(regionCode("europe"), "EU");
  assert.equal(regionCode("usa"), "US");
  assert.equal(regionName("asia"), "asia");
});

test("tiers render as customer-facing names and codes", () => {
  assert.equal(tierName("CLASSIC"), "Standard");
  assert.equal(tierName("HIGH_PERFORMANCE"), "High performance");
  assert.equal(tierCode("CLASSIC"), "STANDARD");
  assert.equal(tierCode("HIGH_PERFORMANCE"), "HIGH PERF");
});

test("regions and tiers sort in storefront order", () => {
  assert.deepEqual(["usa", "europe"].sort(sortRegions), ["europe", "usa"]);
  assert.deepEqual(["HIGH_PERFORMANCE", "CLASSIC"].sort(sortTiers), [
    "CLASSIC",
    "HIGH_PERFORMANCE",
  ]);
});
