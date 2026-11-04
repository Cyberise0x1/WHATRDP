"use client";

import { useCallback, useEffect, useState } from "react";
import { formatMoney } from "@/lib/pricing";
import { LEGAL_LINKS } from "@/lib/legal";
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

export function OrderConsole({ token }: { token: string }) {
  const [order, setOrder] = useState<OrderView | null>(null);
  const [missing, setMissing] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  const load = useCallback(async () => {
    const response = await fetch(`/api/orders/${encodeURIComponent(token)}`, { cache: "no-store" });
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
    if (!order || !POLLABLE.has(order.status)) return;
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
        <strong>Treat this link as a password:</strong> anyone who has it can view these
        credentials. We can reset the password at any time on request.
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
