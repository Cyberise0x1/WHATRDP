import { test } from "node:test";
import assert from "node:assert/strict";
import { api, ApiError } from "../../src/lib/rdpmonster";
import { runProvisioning } from "../../src/lib/provisioning";
import { resetAlertThrottle } from "../../src/lib/alerts";
import type { Order } from "../../src/lib/storage/types";

process.env.RDP_MONSTER_API_TOKEN = "fixture_not_a_real_token";

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

function operationalAlerts(lines: string[]) {
  return lines
    .map((line) => {
      try {
        return JSON.parse(line) as {
          event?: string;
          code?: string;
          severity?: string;
          context?: unknown;
        };
      } catch {
        return null;
      }
    })
    .filter((value): value is { event: string; code: string; severity: string; context: unknown } =>
      Boolean(value && value.event === "operational_alert"),
    );
}

test("supplier 401/403 raises a critical auth alert", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = (async () =>
    Response.json(
      { error: "unauthorized", message: "bad token" },
      { status: 401 },
    )) as typeof fetch;
  const captured = captureConsole();
  resetAlertThrottle();
  try {
    await assert.rejects(api("/servers"), ApiError);
    const [alert] = operationalAlerts(captured.lines);
    assert.equal(alert.code, "supplier_auth_failed");
    assert.equal(alert.severity, "critical");
    assert.deepEqual(alert.context, { status: 401, method: "GET", path: "/servers" });
  } finally {
    captured.restore();
    globalThis.fetch = original;
  }
});

test("supplier 402 raises the balance-exhausted alert", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = (async () =>
    Response.json(
      { error: "insufficient_balance", message: "no funds" },
      { status: 402 },
    )) as typeof fetch;
  const captured = captureConsole();
  resetAlertThrottle();
  try {
    await assert.rejects(api("/account"), ApiError);
    const [alert] = operationalAlerts(captured.lines);
    assert.equal(alert.code, "supplier_balance_exhausted");
    assert.equal(alert.severity, "critical");
  } finally {
    captured.restore();
    globalThis.fetch = original;
  }
});

test("supplier 5xx alerts only after read retries are exhausted", async () => {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = (async () => {
    calls += 1;
    return Response.json({ error: "upstream" }, { status: 503 });
  }) as typeof fetch;
  const captured = captureConsole();
  resetAlertThrottle();
  try {
    await assert.rejects(api("/catalog", {}, { retries: 1 }), ApiError);
    assert.equal(calls, 2);
    const [alert] = operationalAlerts(captured.lines);
    assert.equal(alert.code, "supplier_5xx");
    assert.equal(alert.severity, "warning");
    assert.deepEqual(alert.context, { status: 503, method: "GET", path: "/catalog" });
  } finally {
    captured.restore();
    globalThis.fetch = original;
  }
});

test("provisioning rejections and uncertainty raise distinct alerts", async () => {
  const order = { id: 7, status: "PAID" } as Order;
  const store = {
    claimProvision: async () => order,
    update: async (_id: number, patch: Partial<Order>) => ({ ...order, ...patch }),
    byId: async () => order,
  };
  const repo = store as unknown as Parameters<typeof runProvisioning>[0];

  for (const [status, expected] of [
    [400, "provisioning_failed"],
    [503, "provisioning_review_required"],
  ] as const) {
    const captured = captureConsole();
    resetAlertThrottle();
    try {
      await runProvisioning(repo, order.id, async () => {
        throw Object.assign(new Error("fixture"), { status });
      });
      const [alert] = operationalAlerts(captured.lines);
      assert.equal(alert.code, expected);
      assert.equal(alert.severity, "critical");
      assert.deepEqual(alert.context, {
        orderId: 7,
        certainRejection: status === 400,
        supplierStatus: status,
        supplierCode: "unknown",
      });
    } finally {
      captured.restore();
    }
  }
});
