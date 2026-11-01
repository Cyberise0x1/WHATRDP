import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { OrderRepository } from "../../src/lib/storage/repository";
import { getDatabase } from "../../src/lib/database";

test("ordinary Node development retains the SQLite driver on an isolated fixture", async () => {
  const directory = await mkdtemp(join(tmpdir(), "rdpm-node-driver-"));
  process.env.DATABASE_PATH = join(directory, "fixture.db");
  try {
    const repo = new OrderRepository(await getDatabase());
    const order = await repo.create({
      planSku: "europe/1",
      os: "windows-2022",
      cycle: "MONTHLY",
      amountCents: 1599,
    });
    await repo.update(order.id, { payment_reference: "payment_node_fixture" });
    assert.equal((await repo.byToken(order.token))?.plan_sku, "europe/1");
    assert.ok(await repo.claimPayment(order.id, "payment_node_fixture", 1599));
    assert.equal(await repo.claimPayment(order.id, "payment_node_fixture", 1599), null);
    assert.ok(await repo.claimProvision(order.id));
    assert.equal(await repo.claimProvision(order.id), null);
    assert.equal((await repo.recent()).length, 1);
    await assert.rejects(
      repo.update(order.id, { ["status = 'ACTIVE'; --"]: "x" } as never),
      /Unsupported/,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("credential and email claims are conditional, spaced and bounded", async () => {
  const directory = await mkdtemp(join(tmpdir(), "rdpm-node-driver-"));
  process.env.DATABASE_PATH = join(directory, "fixture.db");
  try {
    const repo = new OrderRepository(await getDatabase());
    const order = await repo.create({
      planSku: "europe/1",
      os: "windows-2022",
      cycle: "MONTHLY",
      amountCents: 1599,
      email: "buyer@example.test",
    });
    assert.equal(
      await repo.claimCredentials(order.id, "Administrator", "enc"),
      null,
      "credentials require an ACTIVE order",
    );
    await repo.update(order.id, { status: "ACTIVE" });
    assert.ok(await repo.claimCredentials(order.id, "Administrator", "enc"));
    assert.equal(await repo.claimCredentials(order.id, "Administrator", "enc"), null);

    const future = new Date(Date.now() + 3_600_000).toISOString();
    const past = new Date(Date.now() - 60_000).toISOString();
    assert.equal((await repo.claimCredentialEmail(order.id, past))?.credentials_email_attempts, 1);
    assert.equal(
      await repo.claimCredentialEmail(order.id, past),
      null,
      "an attempt may not repeat inside the retry window",
    );
    assert.deepEqual(
      (await repo.pendingCredentialEmails(new Date(Date.now() + 7_200_000).toISOString())).map(
        (row) => row.id,
      ),
      [order.id],
      "an unsent order with a pending attempt is swept",
    );
    assert.equal(
      (await repo.claimCredentialEmail(order.id, future))?.credentials_email_attempts,
      2,
    );
    assert.equal(
      (await repo.claimCredentialEmail(order.id, future))?.credentials_email_attempts,
      3,
    );
    assert.equal(await repo.claimCredentialEmail(order.id, future), null, "attempts are bounded");
    assert.deepEqual(
      await repo.pendingCredentialEmails(new Date(Date.now() + 7_200_000).toISOString()),
      [],
      "an order whose attempts are exhausted is not swept",
    );

    assert.ok(await repo.markCredentialEmailSent(order.id));
    assert.equal(await repo.markCredentialEmailSent(order.id), null);
    assert.deepEqual(
      await repo.pendingCredentialEmails(new Date(Date.now() + 7_200_000).toISOString()),
      [],
    );

    const withoutEmail = await repo.create({
      planSku: "europe/1",
      os: "windows-2022",
      cycle: "MONTHLY",
      amountCents: 1599,
    });
    await repo.update(withoutEmail.id, { status: "ACTIVE" });
    assert.ok(await repo.claimCredentials(withoutEmail.id, "Administrator", "enc"));
    assert.equal(await repo.claimCredentialEmail(withoutEmail.id, future), null);
    assert.deepEqual(
      (await repo.pendingCredentialEmails(new Date(Date.now() + 7_200_000).toISOString())).map(
        (row) => row.id,
      ),
      [],
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
