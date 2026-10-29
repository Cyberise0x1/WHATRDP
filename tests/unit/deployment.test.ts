import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { parse as yaml } from "yaml";
import { deploymentConfig, hasRequiredReviewers } from "../../scripts/lib/deployment";

const ids = {
  staging: "11111111-1111-4111-8111-111111111111",
  production: "22222222-2222-4222-8222-222222222222",
};
const approved = {
  DEPLOYMENT_APPROVED: "true",
  STAGING_WORKER_NAME: "rdpmonster-staging",
  STAGING_D1_DATABASE_NAME: "orders-staging",
  STAGING_D1_DATABASE_ID: ids.staging,
  PRODUCTION_WORKER_NAME: "rdpmonster-production",
  PRODUCTION_D1_DATABASE_NAME: "orders-production",
  PRODUCTION_D1_DATABASE_ID: ids.production,
};

test("deploy configuration fails closed without approval or valid separate resources", () => {
  assert.throws(() => deploymentConfig("production", {}, {}));
  assert.throws(() => deploymentConfig("unknown", approved, {}));
  assert.throws(() =>
    deploymentConfig(
      "staging",
      { ...approved, STAGING_D1_DATABASE_ID: "00000000-0000-0000-0000-000000000008" },
      {},
    ),
  );
  assert.throws(() =>
    deploymentConfig("production", { ...approved, PRODUCTION_D1_DATABASE_ID: ids.staging }, {}),
  );
  assert.throws(() =>
    deploymentConfig(
      "production",
      { ...approved, PRODUCTION_WORKER_NAME: "rdpmonster-staging" },
      {},
    ),
  );
  assert.throws(() =>
    deploymentConfig("production", { ...approved, STAGING_D1_DATABASE_ID: undefined }, {}),
  );
});

test("deployment always overrides fixture entry points and unsafe feature flags", () => {
  const config = deploymentConfig("staging", approved, {
    main: "tests/fixtures/worker-fixture.mjs",
    vars: { PROVISIONING_ENABLED: "true" },
  });
  assert.match(config.main, /\.open-next\/worker\.js$/);
  assert.equal(config.vars.PROVISIONING_ENABLED, "false");
  assert.equal(config.d1_databases[0].database_id, ids.staging);
  assert.equal(config.name, approved.STAGING_WORKER_NAME);
});

test("production policy requires actual nonempty required-reviewer rules", () => {
  assert.equal(hasRequiredReviewers(null), false);
  assert.equal(hasRequiredReviewers({ protection_rules: [] }), false);
  assert.equal(hasRequiredReviewers({ protection_rules: [{ type: "wait_timer" }] }), false);
  assert.equal(
    hasRequiredReviewers({ protection_rules: [{ type: "required_reviewers", reviewers: [] }] }),
    false,
  );
  assert.equal(
    hasRequiredReviewers({
      protection_rules: [{ type: "required_reviewers", reviewers: [{ type: "Team" }] }],
    }),
    true,
  );
});

test("workflow YAML is valid, actions are pinned and deployment is gated", async () => {
  for (const file of await readdir(".github/workflows")) {
    const content = await readFile(`.github/workflows/${file}`, "utf8");
    const workflow = yaml(content);
    assert.ok(workflow.name && workflow.on && workflow.jobs);
    assert.equal(workflow.permissions.contents, "read");
    assert.doesNotMatch(content, /pull_request_target|secrets:\s*inherit/);
    for (const action of content.matchAll(/uses:\s*([^\s#]+)/g)) {
      assert.ok(action[1].startsWith("./") || /@[a-f0-9]{40}$/.test(action[1]), action[1]);
    }
    if (file.includes("production")) {
      assert.ok(workflow.on.workflow_dispatch);
      assert.equal(workflow.jobs.deploy.environment, "production");
      assert.match(content, /verify-production-policy/);
      const policyStep = workflow.jobs.deploy.steps.find(
        (step: { name?: string }) => step.name === "Verify required-reviewer protection exists",
      );
      assert.equal(
        policyStep.env.PRODUCTION_POLICY_READ_TOKEN,
        "${{ secrets.PRODUCTION_POLICY_READ_TOKEN }}",
      );
      assert.equal(policyStep.env.GH_TOKEN, undefined);
      assert.match(workflow.jobs.checks.if, /ENABLE_PRODUCTION_DEPLOYMENTS/);
      assert.match(workflow.jobs.checks.if, /refs\/heads\/main/);
    }
    if (file.includes("staging")) {
      assert.match(workflow.jobs.deploy.if, /head_repository\.full_name == github.repository/);
      assert.match(workflow.jobs.deploy.if, /conclusion == 'success'/);
      assert.equal(workflow.jobs.deploy.environment, "staging");
    }
  }
});
