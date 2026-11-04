"use client";

import { useCallback, useEffect, useState } from "react";
import { formatMoney } from "@/lib/pricing";
import { LEGAL_LINKS } from "@/lib/legal";
import type { PowerAction } from "@/lib/power-actions";
import { Emblem } from "./Emblem";

interface OrderView {
  id: number;
  plan: string;
  os: string;
  cycle: string;
  amountCents: number;
  amountMinor?: number;
  currency?: string;
  status: string;
  ip: string | null;
  power: string | null;
  error: string | null;
  credentials: { user: string; password: string } | null;
}

const POLLABLE = new Set(["PAID", "PROVISIONING"]);

const LABELS: Record<string, string> = {
  PENDING_PAYMENT: "Awaiting payment",
  PAID: "Payment confirmed",
  PROVISIONING: "Provisioning",
  ACTIVE: "Connected",
  FAILED: "Provisioning failed",
  REVIEW_REQUIRED: "Support review required",
  CANCELLED: "Cancelled",
};

const STATUS_CODES: Record<string, string> = {
  PENDING_PAYMENT: "WAITING",
  PAID: "PAID",
  PROVISIONING: "PROVISIONING",
  ACTIVE: "LIVE",
  FAILED: "FAILED",
  REVIEW_REQUIRED: "REVIEW",
  CANCELLED: "CANCELLED",
};

const POWER_ACTIONS: { action: PowerAction; label: string; confirm?: string }[] = [
  { action: "start", label: "START" },
  {
    action: "reboot",
    label: "REBOOT",
    confirm: "Reboot this server? Any active session will disconnect.",
  },
  {
    action: "shutdown",
    label: "SHUT DOWN",
    confirm: "Shut down this server? It stays offline until you start it.",
  },
  {
    action: "stop",
    label: "FORCE OFF",
    confirm: "Force the server off? Unsaved work may be lost.",
  },
];

function isRunning(power: string | null) {
  return /^(running|on)$/i.test(power ?? "");
}

function isStopped(power: string | null) {
  return /^(stopped|off|powered_off)$/i.test(power ?? "");
}

function isTransitioning(power: string | null) {
  return /^(starting|stopping|rebooting|restarting|shutting_down)$/i.test(power ?? "");
}

function actionLabel(action: PowerAction) {
  return POWER_ACTIONS.find((item) => item.action === action)?.label ?? action.toUpperCase();
}

export function OrderConsole({ token }: { token: string }) {
  const [order, setOrder] = useState<OrderView | null>(null);
  const [missing, setMissing] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<PowerAction | null>(null);
  const [confirming, setConfirming] = useState<PowerAction | null>(null);
  const [actionMessage, setActionMessage] = useState<{
    kind: "status" | "error";
    text: string;
  } | null>(null);

  const load = useCallback(async () => {
    const response = await fetch(`/api/orders/${encodeURIComponent(token)}?sync=1`, {
      cache: "no-store",
    });
    if (response.status === 404) {
      setMissing(true);
      return;
    }
    const payload = (await response.json()) as { data?: OrderView };
    if (payload.data) setOrder(payload.data);
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!order) return;
    if (!POLLABLE.has(order.status) && !isTransitioning(order.power)) return;
    const timer = setInterval(() => void load(), 3000);
    return () => clearInterval(timer);
  }, [order, load]);

  async function copy(value: string, field: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(field);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      setCopied(null);
    }
  }

  async function runAction(action: PowerAction) {
    setPendingAction(action);
    setConfirming(null);
    setActionMessage(null);

    try {
      const response = await fetch(`/api/orders/${encodeURIComponent(token)}/actions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const payload = (await response.json().catch(() => null)) as {
        data?: OrderView;
        message?: string;
      } | null;

      if (!response.ok) {
        setActionMessage({
          kind: "error",
          text: payload?.message ?? "The power action could not be completed. Try again shortly.",
        });
        if (response.status === 409) void load();
        return;
      }

      if (payload?.data) setOrder(payload.data);
      setActionMessage({
        kind: "status",
        text: `${actionLabel(action)} requested. Status refreshes automatically.`,
      });
      window.setTimeout(() => void load(), 4000);
    } catch {
      setActionMessage({
        kind: "error",
        text: "The power action could not be sent. Check your connection and try again.",
      });
    } finally {
      setPendingAction(null);
    }
  }

  if (missing) {
    return (
      <section className="order-message error">
        <p className="session-id">SESSION NOT FOUND</p>
        <h1>No session.</h1>
        <p>This link is invalid or the order no longer exists. Check the link and try again.</p>
        <p>
          <a className="button ghost" href="/">
            RETURN TO CATALOGUE
          </a>
        </p>
      </section>
    );
  }

  if (!order) {
    return (
      <section className="order-message">
        <p className="session-id">WHATRDP://CONNECT</p>
        <h1>Establishing session…</h1>
        <p>
          Reading the order record <span className="terminal-cursor" aria-hidden="true" />
        </p>
      </section>
    );
  }

  const currentIndex = ["PAID", "PROVISIONING", "ACTIVE"].indexOf(order.status);
  const live = POLLABLE.has(order.status) || order.status === "ACTIVE";
  const transitioning = isTransitioning(order.power);

  return (
    <section className="order-console">
      <Emblem className="order-emblem" />

      <div className="order-head">
        <div>
          <p className="session-id">
            SESSION #{order.id} // {order.plan}
          </p>
          <h1 aria-live="polite">{LABELS[order.status] ?? order.status}</h1>
        </div>
        <span className="session-status">
          <span className={live ? "status-dot live" : "status-dot"} aria-hidden="true" />
          {STATUS_CODES[order.status] ?? order.status}
        </span>
      </div>

      <div className="status-track">
        {["PAID", "PROVISIONING", "ACTIVE"].map((step, index) => (
          <span
            key={step}
            className={index <= currentIndex ? "dot done" : "dot"}
            aria-label={step}
          />
        ))}
      </div>
      <div className="status-track-labels" aria-hidden="true">
        <span>PAID</span>
        <span>PROVISIONING</span>
        <span>CONNECTED</span>
      </div>

      <dl className="order-manifest">
        <div className="manifest-item">
          <dt>Plan</dt>
          <dd>{order.plan}</dd>
        </div>
        <div className="manifest-item">
          <dt>Operating system</dt>
          <dd>{order.os}</dd>
        </div>
        <div className="manifest-item">
          <dt>Term</dt>
          <dd>{order.cycle}</dd>
        </div>
        <div className="manifest-item">
          <dt>Paid</dt>
          <dd>{formatMoney(order.amountMinor ?? order.amountCents, order.currency ?? "USD")}</dd>
        </div>
      </dl>

      {order.error ? <div className="session-alert">{order.error}</div> : null}

      {order.status === "ACTIVE" ? (
        <div className="power-panel">
          <div className="power-head">
            <h2>Power controls</h2>
            <span className="power-state" aria-live="polite">
              POWER // {order.power?.toUpperCase() ?? "UNKNOWN"}
            </span>
          </div>

          <div className="power-actions">
            {POWER_ACTIONS.map((item) => (
              <button
                key={item.action}
                type="button"
                className="button ghost small"
                onClick={() =>
                  item.confirm ? setConfirming(item.action) : void runAction(item.action)
                }
                disabled={
                  pendingAction !== null ||
                  transitioning ||
                  (item.action === "start" ? isRunning(order.power) : isStopped(order.power))
                }
              >
                {pendingAction === item.action ? "SENDING…" : item.label}
              </button>
            ))}
            <button
              type="button"
              className="button ghost small"
              onClick={() => void load()}
              disabled={pendingAction !== null}
            >
              REFRESH
            </button>
          </div>

          {confirming ? (
            <div className="power-confirm" role="alertdialog" aria-label="Confirm power action">
              <p>{POWER_ACTIONS.find((item) => item.action === confirming)?.confirm}</p>
              <div className="power-actions">
                <button
                  type="button"
                  className="button primary small"
                  onClick={() => void runAction(confirming)}
                  disabled={pendingAction !== null}
                >
                  CONFIRM
                </button>
                <button
                  type="button"
                  className="button ghost small"
                  onClick={() => setConfirming(null)}
                >
                  CANCEL
                </button>
              </div>
            </div>
          ) : null}

          {actionMessage ? (
            <p
              className={actionMessage.kind === "error" ? "power-message error" : "power-message"}
              role={actionMessage.kind === "error" ? "alert" : "status"}
            >
              {actionMessage.text}
            </p>
          ) : null}

          <p className="power-hint">
            Actions affect the live server immediately. Active sessions will disconnect.
          </p>
        </div>
      ) : null}

      {order.credentials ? (
        <div className="credentials">
          <h2>Connection details</h2>

          <div className="credential-row">
            <span className="credential-label">IP address</span>
            <code>{order.ip ?? "—"}</code>
            <button
              type="button"
              className="button ghost small"
              onClick={() => copy(order.ip ?? "", "ip")}
              aria-label="Copy IP address"
            >
              {copied === "ip" ? "COPIED" : "COPY"}
            </button>
          </div>

          <div className="credential-row">
            <span className="credential-label">Username</span>
            <code>{order.credentials.user}</code>
            <button
              type="button"
              className="button ghost small"
              onClick={() => copy(order.credentials!.user, "user")}
              aria-label="Copy username"
            >
              {copied === "user" ? "COPIED" : "COPY"}
            </button>
          </div>

          <div className="credential-row">
            <span className="credential-label">Password</span>
            <code>{order.credentials.password}</code>
            <button
              type="button"
              className="button ghost small"
              onClick={() => copy(order.credentials!.password, "pass")}
              aria-label="Copy password"
            >
              {copied === "pass" ? "COPIED" : "COPY"}
            </button>
          </div>
        </div>
      ) : null}

      <p className="session-note">
        Bookmark this page. We also email these details to the address used at checkout.{" "}
        <strong>Treat this link as a password:</strong> anyone who has it can view these credentials
        and control the server. We can reset the password at any time on request.
      </p>

      <div className="session-legal">
        {LEGAL_LINKS.map((link) => (
          <a key={link.href} href={link.href} target="_blank" rel="noopener noreferrer">
            {link.label}
          </a>
        ))}
      </div>
    </section>
  );
}
