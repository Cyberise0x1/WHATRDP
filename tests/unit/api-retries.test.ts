import { test } from "node:test";
import assert from "node:assert/strict";
import {
  api,
  ApiError,
  createServer,
  findServerByLabel,
  type Server,
} from "../../src/lib/rdpmonster";

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
  } finally {
    globalThis.fetch = original;
  }
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
  } finally {
    globalThis.fetch = original;
  }
});

function entry(label: string): Server {
  return {
    id: label,
    label,
    status: "ACTIVE",
    power: "on",
    product: null,
    plan: null,
    resellerProduct: null,
    region: null,
    tier: null,
    os: null,
    resources: { cpuCores: 1, ramMb: 1024, diskGb: 10, ipv4Count: 1 },
    ips: [],
    cycle: "MONTHLY",
    priceCents: 100,
    autoRenew: false,
    expiresAt: null,
  };
}

test("label reconciliation walks every page instead of only the first", async () => {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async (input) => {
    calls += 1;
    const page = Number(new URL(String(input)).searchParams.get("page"));
    if (page === 1) {
      return Response.json({
        data: Array.from({ length: 200 }, (_, index) => entry(`other-${index}`)),
        meta: { total: 201 },
      });
    }
    return Response.json({ data: [entry("web-target")], meta: { total: 201 } });
  };
  try {
    const found = await findServerByLabel("web-target", 0);
    assert.equal(found?.label, "web-target");
    assert.equal(calls, 2);
  } finally {
    globalThis.fetch = original;
  }
});

test("label reconciliation stops at the reported total and at a short page", async () => {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async (input) => {
    calls += 1;
    const url = new URL(String(input));
    const page = Number(url.searchParams.get("page"));
    if (calls === 1) {
      return Response.json({
        data: Array.from({ length: 200 }, (_, index) => entry(`other-${index}`)),
        meta: { total: 200 },
      });
    }
    return Response.json({ data: [entry(`page-${page}`)] });
  };
  try {
    assert.equal(await findServerByLabel("web-target", 0), null);
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = original;
  }
});

test("a timed-out create recovers the server by label instead of ordering twice", async () => {
  const original = globalThis.fetch;
  let posts = 0;
  let reads = 0;
  globalThis.fetch = async (_input, init) => {
    if ((init?.method ?? "GET").toUpperCase() === "POST") {
      posts += 1;
      throw new DOMException("The operation was aborted due to timeout", "TimeoutError");
    }
    reads += 1;
    return Response.json({ data: [entry("web-target")], meta: { total: 1 } });
  };
  try {
    const result = await createServer({ label: "web-target", plan: "europe/1" });
    assert.equal(posts, 1, "the billable request is never repeated");
    assert.equal(reads, 1);
    assert.equal(result.recovered, true);
    assert.equal(result.data.id, "web-target");
  } finally {
    globalThis.fetch = original;
  }
});

test("a definite rejection fails fast without scanning the account", async () => {
  const original = globalThis.fetch;
  let reads = 0;
  globalThis.fetch = async (_input, init) => {
    if ((init?.method ?? "GET").toUpperCase() === "POST") {
      return Response.json({ error: "insufficient_balance" }, { status: 402 });
    }
    reads += 1;
    return Response.json({ data: [] });
  };
  try {
    await assert.rejects(createServer({ label: "web-target" }), (error: unknown) => {
      assert.ok(error instanceof ApiError);
      assert.equal(error.status, 402);
      return true;
    });
    assert.equal(reads, 0);
  } finally {
    globalThis.fetch = original;
  }
});
