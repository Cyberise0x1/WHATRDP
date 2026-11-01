import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { verifyWebhook } from "../../src/lib/signature";

const SECRET = "fixture_provider_secret";
const now = () => String(Math.floor(Date.now() / 1000));

function signature(secret: string | Buffer, timestamp: string, body: string): string {
  return "v1=" + createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
}

function headers(value: string, timestamp = now()): Headers {
  return new Headers({ "x-rdpm-timestamp": timestamp, "x-rdpm-signature": value });
}

test("accepts the documented v1 signature over timestamp.body", () => {
  const body = '{"event":"server.created"}';
  const timestamp = now();
  assert.equal(
    verifyWebhook(body, headers(signature(SECRET, timestamp, body), timestamp), SECRET),
    true,
  );
});

test("accepts a whsec_ secret used raw or base64-decoded", () => {
  const key = Buffer.from("fixture-standard-webhooks-key");
  const secret = `whsec_${key.toString("base64")}`;
  const body = '{"event":"payment.failed"}';
  const timestamp = now();

  assert.equal(
    verifyWebhook(body, headers(signature(secret, timestamp, body), timestamp), secret),
    true,
  );
  assert.equal(
    verifyWebhook(body, headers(signature(key, timestamp, body), timestamp), secret),
    true,
  );
});

test("accepts a bare hex signature and rejects tampering, staleness and missing headers", () => {
  const body = '{"event":"invoice.paid"}';
  const timestamp = now();
  const bare = createHmac("sha256", SECRET).update(`${timestamp}.${body}`).digest("hex");
  assert.equal(verifyWebhook(body, headers(bare, timestamp), SECRET), true);

  assert.equal(
    verifyWebhook(body + " ", headers(signature(SECRET, timestamp, body), timestamp), SECRET),
    false,
  );
  assert.equal(verifyWebhook(body, headers(signature(SECRET, "100", body), "100"), SECRET), false);
  assert.equal(verifyWebhook(body, new Headers(), SECRET), false);
  assert.equal(
    verifyWebhook(body, headers(signature(SECRET, timestamp, body), timestamp), ""),
    false,
  );
});
