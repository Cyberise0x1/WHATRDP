// Operational alerts.
//
// Every alert is always written to the log as one structured
// `operational_alert` line. When ALERT_WEBHOOK_URL is configured the same alert
// is also POSTed to a generic webhook (Slack, Discord, Telegram or any JSON
// endpoint). Delivery is best-effort: it never throws, never changes a
// response, and a slow webhook must not hold a request open.
//
// Alerts must never contain customer data or credentials. Callers pass only
// safe scalar context; everything is scrubbed again here before it is logged or
// sent off the platform.

export type AlertSeverity = "info" | "warning" | "critical";

export interface AlertInput {
  /** Stable, machine-readable code, e.g. `supplier_auth_failed`. */
  code: string;
  severity: AlertSeverity;
  /** Operator-facing text. Keep it credential-free. */
  message: string;
  context?: Record<string, unknown>;
  /** Per-code webhook cooldown. Defaults to five minutes; 0 disables it. */
  cooldownMs?: number;
}

export interface OperationalAlert {
  event: "operational_alert";
  code: string;
  severity: AlertSeverity;
  message: string;
  context: Record<string, string | number | boolean | null>;
  at: string;
}

type AlertContextValue = string | number | boolean | null;

const DEFAULT_COOLDOWN_MS = 5 * 60 * 1000;
const DELIVERY_TIMEOUT_MS = 3_000;
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const PREFIXED_SECRET = /\b(?:rdpm|sk|whsec|rk|pk|ghp|github_pat)_[A-Za-z0-9_-]+/gi;
const SENSITIVE_KEY =
  /(token|secret|password|authorization|cookie|email|api[-_]?key|signature|credential)/i;

type BackgroundScheduler = (task: Promise<unknown>) => void;

let scheduler: BackgroundScheduler | undefined;
const lastDelivered = new Map<string, number>();

/**
 * Let the runtime keep alert delivery alive after the caller returns. The
 * Worker entry installs `ctx.waitUntil`; without it the fire-and-forget
 * promise is still started, which is correct for Node dev and tests.
 */
export function setAlertBackgroundScheduler(next: BackgroundScheduler | undefined): void {
  scheduler = next;
}

/** Test helper: clear the per-isolate webhook cooldown. */
export function resetAlertThrottle(): void {
  lastDelivered.clear();
}

function scrub(value: string, limit = 500): string {
  return value
    .replace(EMAIL, "[redacted-email]")
    .replace(PREFIXED_SECRET, "[redacted]")
    .slice(0, limit);
}

function sanitizeContext(
  context: Record<string, unknown> | undefined,
): Record<string, AlertContextValue> {
  const safe: Record<string, AlertContextValue> = {};
  for (const [key, raw] of Object.entries(context ?? {})) {
    if (SENSITIVE_KEY.test(key)) continue;
    if (raw === null || typeof raw === "number" || typeof raw === "boolean") {
      safe[key] = raw;
    } else if (typeof raw === "string") {
      safe[key] = scrub(raw, 200);
    }
  }
  return safe;
}

export function normalizeAlert(input: AlertInput, now = new Date()): OperationalAlert {
  return {
    event: "operational_alert",
    code: scrub(input.code, 80),
    severity: input.severity,
    message: scrub(input.message),
    context: sanitizeContext(input.context),
    at: now.toISOString(),
  };
}

function logAlert(alert: OperationalAlert): void {
  // One JSON object per line so Workers Logs (and any log drain) can index it.
  try {
    const line = JSON.stringify(alert);
    if (alert.severity === "critical") console.error(line);
    else console.warn(line);
  } catch {
    // Logging must never break the caller.
  }
}

function alertText(alert: OperationalAlert): string {
  const context = Object.entries(alert.context)
    .map(([key, value]) => `${key}=${value}`)
    .join(" ");
  return `[${alert.severity.toUpperCase()}] ${alert.code}: ${alert.message}${
    context ? ` (${context})` : ""
  }`;
}

function safeHost(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return "";
  }
}

export interface AlertPayload {
  body: Record<string, unknown>;
  deliverable: boolean;
}

/**
 * Shape the delivery body for the configured webhook. Slack and Discord reject
 * unknown top-level fields less predictably than they ignore extra text, so
 * they receive the native field. Telegram reads `chat_id` from the URL query.
 */
export function buildAlertPayload(url: string, alert: OperationalAlert): AlertPayload {
  const text = alertText(alert).slice(0, 3_900);
  const host = safeHost(url);

  if (host === "hooks.slack.com" || host.endsWith(".slack.com")) {
    return { body: { text }, deliverable: true };
  }
  if (host === "discord.com" || host.endsWith(".discord.com") || host.endsWith("discordapp.com")) {
    return { body: { content: text.slice(0, 1_900) }, deliverable: true };
  }
  if (host === "api.telegram.org") {
    let chatId: string | null = null;
    try {
      chatId = new URL(url).searchParams.get("chat_id");
    } catch {
      chatId = null;
    }
    if (!chatId) return { body: {}, deliverable: false };
    return { body: { chat_id: chatId, text }, deliverable: true };
  }

  return { body: { text, alert }, deliverable: true };
}

export async function deliverAlert(
  url: string,
  alert: OperationalAlert,
  fetchImpl: typeof fetch = fetch,
): Promise<boolean> {
  const { body, deliverable } = buildAlertPayload(url, alert);
  if (!deliverable) return false;

  try {
    const response = await fetchImpl(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      // A webhook must not hold a request open if the endpoint is slow.
      signal: AbortSignal.timeout(DELIVERY_TIMEOUT_MS),
    });
    // Drain the body so Node does not keep the socket open.
    await response.text().catch(() => "");
    return response.ok;
  } catch {
    return false;
  }
}

function throttled(code: string, cooldownMs: number, nowMs: number): boolean {
  if (cooldownMs <= 0) return false;
  const previous = lastDelivered.get(code);
  if (previous !== undefined && nowMs - previous < cooldownMs) return true;
  lastDelivered.set(code, nowMs);
  return false;
}

/**
 * Record an operational alert.
 *
 * Returns the delivery promise when a webhook is configured, otherwise
 * `undefined`. The promise never rejects, so callers may ignore it.
 */
export function raiseAlert(
  input: AlertInput,
  options: { now?: Date; fetchImpl?: typeof fetch } = {},
): Promise<boolean> | undefined {
  const now = options.now ?? new Date();
  const alert = normalizeAlert(input, now);
  logAlert(alert);

  const url = process.env.ALERT_WEBHOOK_URL?.trim();
  if (!url) return undefined;
  if (throttled(alert.code, input.cooldownMs ?? DEFAULT_COOLDOWN_MS, now.getTime())) {
    return undefined;
  }

  const delivery = deliverAlert(url, alert, options.fetchImpl ?? fetch);
  if (scheduler) {
    try {
      scheduler(delivery);
      return delivery;
    } catch {
      // Fall through to a plain fire-and-forget promise.
    }
  }
  void delivery;
  return delivery;
}
