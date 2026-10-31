import { test } from "node:test";
import assert from "node:assert/strict";
import { verifyTurnstile } from "../../src/lib/turnstile";

test("refuses to verify without a configured secret or a token", async () => {
  assert.deepEqual(await verifyTurnstile("token", null, ""), {
    success: false,
    codes: ["missing-secret"],
  });
  assert.deepEqual(await verifyTurnstile(null, null, "secret"), {
    success: false,
    codes: ["missing-token"],
  });
});

test("verifies against the documented endpoint and forwards the remote IP", async () => {
  const original = globalThis.fetch;
  let captured = { url: "", body: "" };
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    captured = { url: String(input), body: String(init?.body ?? "") };
    return Response.json({ success: true });
  }) as typeof fetch;

  try {
    const result = await verifyTurnstile("valid", "203.0.113.9", "secret");
    assert.deepEqual(result, { success: true, codes: [] });
    assert.match(captured.url, /siteverify/);
    const params = new URLSearchParams(captured.body);
    assert.equal(params.get("secret"), "secret");
    assert.equal(params.get("response"), "valid");
    assert.equal(params.get("remoteip"), "203.0.113.9");
  } finally {
    globalThis.fetch = original;
  }
});

test("failures, HTTP errors and network errors all fail closed", async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = (async () =>
      Response.json({
        success: false,
        "error-codes": ["invalid-input-response"],
      })) as typeof fetch;
    assert.deepEqual(await verifyTurnstile("bad", null, "secret"), {
      success: false,
      codes: ["invalid-input-response"],
    });

    globalThis.fetch = (async () => new Response("nope", { status: 500 })) as typeof fetch;
    assert.equal((await verifyTurnstile("bad", null, "secret")).success, false);

    globalThis.fetch = (async () => {
      throw new Error("network");
    }) as typeof fetch;
    assert.deepEqual(await verifyTurnstile("bad", null, "secret"), {
      success: false,
      codes: ["verify-error"],
    });
  } finally {
    globalThis.fetch = original;
  }
});
