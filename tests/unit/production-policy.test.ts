import assert from "node:assert/strict";
import test from "node:test";
import { verifyProductionPolicy } from "../../scripts/lib/production-policy";

const access = {
  eventName: "workflow_dispatch",
  ref: "refs/heads/main",
  repository: "fixture-owner/fixture-repo",
  policyReadToken: "dummy-policy-read-token",
};

test("production policy uses the protected credential for the exact read-only environment API", async () => {
  let calls = 0;
  await verifyProductionPolicy(access, async (url, init) => {
    calls++;
    assert.equal(
      url,
      "https://api.github.com/repos/fixture-owner/fixture-repo/environments/production",
    );
    assert.equal(init?.method ?? "GET", "GET");
    assert.equal(new Headers(init?.headers).get("Authorization"), "Bearer dummy-policy-read-token");
    return Response.json({
      protection_rules: [{ type: "required_reviewers", reviewers: [{ type: "Team", id: 1 }] }],
    });
  });
  assert.equal(calls, 1);
});

test("production policy makes no request without explicit access or a manual main release", async () => {
  let calls = 0;
  const unexpected: typeof fetch = async () => {
    calls++;
    throw new Error("Unexpected network request");
  };
  for (const override of [
    { policyReadToken: undefined },
    { policyReadToken: "" },
    { eventName: "pull_request" },
    { ref: "refs/heads/other" },
    { repository: "../unexpected" },
  ]) {
    await assert.rejects(verifyProductionPolicy({ ...access, ...override }, unexpected));
  }
  assert.equal(calls, 0);
});

test("production policy fails closed for denied access, unavailable APIs and missing reviewers", async () => {
  for (const response of [
    new Response(null, { status: 401 }),
    new Response(null, { status: 403 }),
    new Response(null, { status: 404 }),
    new Response(null, { status: 500 }),
    Response.json({ protection_rules: [] }),
    Response.json({ protection_rules: [{ type: "required_reviewers", reviewers: [] }] }),
    Response.json({ protection_rules: [{ type: "wait_timer", wait_timer: 1 }] }),
    new Response("not json", { status: 200 }),
  ]) {
    await assert.rejects(verifyProductionPolicy(access, async () => response));
  }
  await assert.rejects(
    verifyProductionPolicy(access, async () => {
      throw new Error("Fixture timeout");
    }),
  );
});
