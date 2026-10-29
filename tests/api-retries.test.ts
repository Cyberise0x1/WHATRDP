import { test } from "node:test";
import assert from "node:assert/strict";
import { api, ApiError } from "../storefront/src/lib/rdpmonster";

process.env.RDP_MONSTER_API_TOKEN = "fixture_not_a_real_token";

test("write requests are never retried, including rate limits", async () => {
  const original = globalThis.fetch;
  try {
    for (const status of [429, 500]) {
      let calls = 0;
      globalThis.fetch = async () => {
        calls++;
        return Response.json({ error: "fixture_failure" }, { status });
      };
      await assert.rejects(api("/servers", { method: "POST" }, { retries: 3 }), ApiError);
      assert.equal(calls, 1);
    }
  } finally { globalThis.fetch = original; }
});

test("read retries are bounded and do not contact the actual provider", async () => {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    return Response.json({ error: "fixture_failure" }, { status: 503 });
  };
  try {
    await assert.rejects(api("/catalog", {}, { retries: 2 }), ApiError);
    assert.equal(calls, 3);
  } finally { globalThis.fetch = original; }
});
