import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildAlertPayload,
  deliverAlert,
  normalizeAlert,
  raiseAlert,
  resetAlertThrottle,
  setAlertBackgroundScheduler,
  type OperationalAlert,
} from "../../src/lib/alerts";

function sample(overrides: Partial<OperationalAlert> = {}): OperationalAlert {
  return {
    event: "operational_alert",
    code: "supplier_auth_failed",
    severity: "critical",
    message: "The supplier API rejected our credentials",
    context: { status: 401, path: "/catalog" },
    at: "2026-11-01T00:00:00.000Z",
    ...overrides,
  };
}

function captureConsole() {
  const lines: string[] = [];
  const originalError = console.error;
  const originalWarn = console.warn;
  console.error = (...args: unknown[]) => {
    lines.push(args.map((value) => String(value)).join(" "));
  };
  console.warn = (...args: unknown[]) => {
    lines.push(args.map((value) => String(value)).join(" "));
  };
  return {
    lines,
    restore() {
      console.error = originalError;
      console.warn = originalWarn;
    },
  };
}

test("alerts are normalised, redacted and keep only safe scalar context", () => {
  const alert = normalizeAlert(
    {
      code: "payment_unmatched",
      severity: "critical",
      message: "buyer@example.com paid with token rdpm_secretvalue",
      context: {
        email: "buyer@example.com",
        token: "rdpm_secretvalue",
        status: 409,
        note: "contact buyer@example.com",
        nested: { password: "nope" },
      },
    },
    new Date("2026-11-01T12:00:00.000Z"),
  );

  assert.equal(alert.event, "operational_alert");
  assert.equal(alert.code, "payment_unmatched");
  assert.equal(alert.at, "2026-11-01T12:00:00.000Z");
  assert.doesNotMatch(alert.message, /buyer@example\.com/);
  assert.doesNotMatch(alert.message, /rdpm_secretvalue/);
  assert.match(alert.message, /\[redacted-email\]/);
  assert.deepEqual(alert.context, {
    status: 409,
    note: "contact [redacted-email]",
  });
});

test("webhook payloads match Slack, Discord and Telegram contracts", () => {
  const alert = sample();
  const text =
    "[CRITICAL] supplier_auth_failed: The supplier API rejected our credentials (status=401 path=/catalog)";

  assert.deepEqual(buildAlertPayload("https://hooks.slack.com/services/T/B/X", alert), {
    body: { text },
    deliverable: true,
  });
  assert.deepEqual(buildAlertPayload("https://discord.com/api/webhooks/1/token", alert), {
    body: { content: text },
    deliverable: true,
  });
  assert.deepEqual(
    buildAlertPayload("https://api.telegram.org/bot123:abc/sendMessage?chat_id=42", alert),
    { body: { chat_id: "42", text }, deliverable: true },
  );
  assert.equal(
    buildAlertPayload("https://api.telegram.org/bot123:abc/sendMessage", alert).deliverable,
    false,
  );
  assert.deepEqual(buildAlertPayload("https://alerts.example.test/hook", alert), {
    body: { text, alert },
    deliverable: true,
  });
});

test("without a webhook an alert is one structured operational_alert log line", () => {
  delete process.env.ALERT_WEBHOOK_URL;
  resetAlertThrottle();
  const captured = captureConsole();
  try {
    const result = raiseAlert({
      code: "supplier_5xx",
      severity: "warning",
      message: "The supplier API returned a server error",
      context: { status: 503, method: "GET", path: "/catalog" },
    });
    assert.equal(result, undefined);
    assert.equal(captured.lines.length, 1);

    const line = JSON.parse(captured.lines[0]) as OperationalAlert;
    assert.equal(line.event, "operational_alert");
    assert.equal(line.code, "supplier_5xx");
    assert.equal(line.severity, "warning");
    assert.deepEqual(line.context, { status: 503, method: "GET", path: "/catalog" });
  } finally {
    captured.restore();
  }
});

test("configured webhooks receive the alert once per cooldown", async () => {
  process.env.ALERT_WEBHOOK_URL = "https://hooks.slack.com/services/T/B/X";
  resetAlertThrottle();
  const captured = captureConsole();
  const seen: { url: string; body: unknown }[] = [];
  const fetchImpl = (async (url: RequestInfo | URL, init?: RequestInit) => {
    seen.push({ url: String(url), body: JSON.parse(String(init?.body)) });
    return new Response("ok");
  }) as typeof fetch;
  const now = new Date("2026-11-01T12:00:00.000Z");

  try {
    await raiseAlert(
      { code: "supplier_5xx", severity: "warning", message: "first" },
      { now, fetchImpl },
    );
    await raiseAlert(
      { code: "supplier_5xx", severity: "warning", message: "second" },
      { now: new Date(now.getTime() + 1_000), fetchImpl },
    );

    assert.equal(seen.length, 1);
    assert.equal(seen[0].url, process.env.ALERT_WEBHOOK_URL);
    assert.deepEqual((seen[0].body as { text: string }).text, "[WARNING] supplier_5xx: first");
    // The log line is still written for the throttled occurrence.
    assert.equal(captured.lines.length, 2);
  } finally {
    captured.restore();
    delete process.env.ALERT_WEBHOOK_URL;
    resetAlertThrottle();
  }
});

test("delivery is best-effort and never rejects", async () => {
  const failing = (async () => {
    throw new Error("network down");
  }) as typeof fetch;

  assert.equal(
    await deliverAlert("https://hooks.slack.com/services/T/B/X", sample(), failing),
    false,
  );
  assert.equal(
    await deliverAlert("https://api.telegram.org/bot123/sendMessage", sample(), failing),
    false,
  );
});

test("the runtime scheduler receives the delivery task", async () => {
  process.env.ALERT_WEBHOOK_URL = "https://hooks.slack.com/services/T/B/X";
  resetAlertThrottle();
  const captured = captureConsole();
  const scheduled: Promise<unknown>[] = [];
  setAlertBackgroundScheduler((task) => {
    scheduled.push(task);
  });
  try {
    const delivery = raiseAlert(
      { code: "backup_stale", severity: "critical", message: "stale" },
      {
        fetchImpl: (async () => new Response("ok")) as typeof fetch,
      },
    );
    assert.ok(delivery);
    assert.equal(scheduled.length, 1);
    assert.equal(await delivery, true);
  } finally {
    setAlertBackgroundScheduler(undefined);
    captured.restore();
    delete process.env.ALERT_WEBHOOK_URL;
    resetAlertThrottle();
  }
});
