import { after, afterEach, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  deliverCredentialsEmail,
  renderCredentialsEmail,
  type EmailEnv,
  type EmailMessage,
} from "../../src/lib/email";
import { OrderRepository } from "../../src/lib/storage/repository";
import type { Order } from "../../src/lib/storage/types";
import { encryptSecret } from "../../src/lib/crypto";
import { getDatabase } from "../../src/lib/database";

const SECRET = "fixture_app_secret_at_least_16";
const PASSWORD = "s3cret<&>";

let directory: string;
let repo: OrderRepository;

async function activeOrder(email: string | null = "buyer@example.test"): Promise<Order> {
  const order = await repo.create({
    planSku: "europe/1",
    os: "windows-2022",
    cycle: "MONTHLY",
    amountCents: 1599,
    email,
    chargeCurrency: "USD",
    chargeAmountMinor: 1599,
  });
  await repo.update(order.id, { status: "ACTIVE", primary_ip: "203.0.113.10" });
  const stored = await repo.claimCredentials(order.id, "Administrator", encryptSecret(PASSWORD));
  assert.ok(stored);
  return stored;
}

function configured(sent: EmailMessage[]): EmailEnv {
  return {
    EMAIL: {
      send: async (message) => {
        sent.push(message);
        return { id: "fixture_message" };
      },
    },
    EMAIL_FROM: "WHATRDP <orders@example.test>",
    PUBLIC_BASE_URL: "https://whatrdp.example",
    APP_SECRET: SECRET,
  };
}

function captureAlerts() {
  const entries: { code: string; severity: string; context?: Record<string, unknown> }[] = [];
  const originalLog = console.log;
  const originalWarn = console.warn;
  const originalError = console.error;
  const capture = (...args: unknown[]) => {
    for (const value of args) {
      if (typeof value !== "string") continue;
      try {
        const parsed = JSON.parse(value) as { event?: string };
        if (parsed.event === "operational_alert") entries.push(parsed as never);
      } catch {
        // Not a structured alert.
      }
    }
  };
  console.log = capture;
  console.warn = capture;
  console.error = capture;
  return {
    entries,
    restore() {
      console.log = originalLog;
      console.warn = originalWarn;
      console.error = originalError;
    },
  };
}

before(async () => {
  directory = await mkdtemp(join(tmpdir(), "rdpm-email-"));
  process.env.DATABASE_PATH = join(directory, "fixture.db");
  process.env.APP_SECRET = SECRET;
  repo = new OrderRepository(await getDatabase());
});

beforeEach(async () => {
  await (await getDatabase()).prepare("DELETE FROM orders").all();
});

afterEach(() => {
  delete process.env.ALERT_WEBHOOK_URL;
});

after(async () => {
  await rm(directory, { recursive: true, force: true });
});

test("credentials email carries the connection details and is sent once", async () => {
  const order = await activeOrder();
  const sent: EmailMessage[] = [];
  const env = configured(sent);

  assert.deepEqual(await deliverCredentialsEmail(env, repo, order), "sent");
  assert.equal(sent.length, 1);
  assert.equal(sent[0].to, "buyer@example.test");
  assert.equal(sent[0].from, "WHATRDP <orders@example.test>");
  assert.match(sent[0].text, /203\.0\.113\.10/);
  assert.match(sent[0].text, /Administrator/);
  assert.match(sent[0].text, /s3cret<&>/);
  assert.match(sent[0].text, new RegExp(`https://whatrdp\\.example/order/${order.token}`));
  assert.match(sent[0].text, /europe\/1/);
  assert.match(sent[0].html ?? "", /s3cret&lt;&amp;&gt;/);

  assert.deepEqual(await deliverCredentialsEmail(env, repo, order), "duplicate");
  assert.equal(sent.length, 1, "a second call must not send again");

  const stored = await repo.byId(order.id);
  assert.ok(stored?.credentials_emailed_at);
  assert.equal(stored?.credentials_email_attempts, 1);
});

test("delivery is skipped without consuming an attempt when unconfigured", async () => {
  const withoutEmail = await activeOrder(null);
  const sent: EmailMessage[] = [];
  assert.deepEqual(await deliverCredentialsEmail(configured(sent), repo, withoutEmail), "skipped");
  assert.equal(sent.length, 0);

  const order = await activeOrder();
  const captured = captureAlerts();
  try {
    assert.deepEqual(
      await deliverCredentialsEmail(
        {
          EMAIL_FROM: "orders@example.test",
          PUBLIC_BASE_URL: "https://whatrdp.example",
          APP_SECRET: SECRET,
        },
        repo,
        order,
      ),
      "skipped",
    );
  } finally {
    captured.restore();
  }
  assert.equal(sent.length, 0);
  assert.ok(captured.entries.some((entry) => entry.code === "email_not_configured"));
  assert.equal((await repo.byId(order.id))?.credentials_email_attempts, 0);
});

test("failures alert without leaking credentials and stop at three attempts", async () => {
  const order = await activeOrder();
  const sent: EmailMessage[] = [];
  const env = configured(sent);
  const captured = captureAlerts();
  const failing = {
    ...env,
    EMAIL: {
      send: async () => {
        throw new Error(`smtp rejected buyer@example.test ${PASSWORD}`);
      },
    },
  };

  try {
    assert.equal(
      await deliverCredentialsEmail(failing, repo, order, { retryAfterMs: -1000 }),
      "failed",
    );
    assert.equal(
      await deliverCredentialsEmail(failing, repo, order, { retryAfterMs: -1000 }),
      "failed",
    );
    assert.equal(
      await deliverCredentialsEmail(failing, repo, order, { retryAfterMs: -1000 }),
      "failed",
    );
    assert.equal(
      await deliverCredentialsEmail(failing, repo, order, { retryAfterMs: -1000 }),
      "duplicate",
    );
  } finally {
    captured.restore();
  }

  const codes = captured.entries.map((entry) => entry.code);
  assert.equal(codes.filter((code) => code === "credentials_email_failed").length, 2);
  assert.equal(codes.filter((code) => code === "credentials_email_exhausted").length, 1);
  const serialized = JSON.stringify(captured.entries);
  assert.doesNotMatch(serialized, /buyer@example\.test/);
  assert.doesNotMatch(serialized, /s3cret/);

  const stored = await repo.byId(order.id);
  assert.equal(stored?.credentials_email_attempts, 3);
  assert.equal(stored?.credentials_emailed_at, null);
  assert.equal(sent.length, 0);
});

test("the renderer always includes the order link when a base URL is configured", () => {
  const order = {
    id: 9,
    token: "token_fixture",
    plan_sku: "usa/2",
    os: "ubuntu-24-04",
    cycle: "ANNUALLY",
    primary_ip: null,
    username: null,
  } as unknown as Order;
  const message = renderCredentialsEmail(order, "pw", "https://whatrdp.com/");
  assert.match(message.text, /IP address: not reported yet/);
  assert.match(message.text, /Username: Administrator/);
  assert.match(message.text, /https:\/\/whatrdp\.com\/order\/token_fixture/);
  assert.equal(message.subject, "Your WHATRDP server is ready (#9)");
});
