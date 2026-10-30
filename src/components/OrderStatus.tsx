"use client";

import { useCallback, useEffect, useState } from "react";
import { formatMoney } from "@/lib/pricing";

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
  PAID: "Payment received",
  PROVISIONING: "Installing your server",
  ACTIVE: "Ready",
  FAILED: "Provisioning failed",
  REVIEW_REQUIRED: "Support review required",
  CANCELLED: "Cancelled",
};

export function OrderStatus({ token }: { token: string }) {
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
      <section className="order">
        <div className="notice error">
          <h1>Order not found</h1>
          <p>This link is invalid or the order no longer exists.</p>
        </div>
      </section>
    );
  }

  if (!order) {
    return (
      <section className="order">
        <p className="muted">Loading order…</p>
      </section>
    );
  }

  return (
    <section className="order">
      <p className="eyebrow">Order #{order.id}</p>
      <h1>{LABELS[order.status] ?? order.status}</h1>

      <div className="status-track">
        {["PAID", "PROVISIONING", "ACTIVE"].map((step, index) => {
          const currentIndex = ["PAID", "PROVISIONING", "ACTIVE"].indexOf(order.status);
          return (
            <span
              key={step}
              className={index <= currentIndex ? "dot done" : "dot"}
              aria-label={step}
            />
          );
        })}
      </div>

      {order.status === "PROVISIONING" || order.status === "PAID" ? (
        <p className="muted">
          Your server is being created and installed. This page updates on its own — usually under a
          minute.
        </p>
      ) : null}

      {order.error ? <div className="notice error compact">{order.error}</div> : null}

      <dl className="order-grid">
        <div>
          <dt>Plan</dt>
          <dd>{order.plan}</dd>
        </div>
        <div>
          <dt>Operating system</dt>
          <dd>{order.os}</dd>
        </div>
        <div>
          <dt>Term</dt>
          <dd>{order.cycle}</dd>
        </div>
        <div>
          <dt>Paid</dt>
          <dd>{formatMoney(order.amountMinor ?? order.amountCents, order.currency ?? "USD")}</dd>
        </div>
      </dl>

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
            >
              {copied === "ip" ? "Copied" : "Copy"}
            </button>
          </div>

          <div className="credential-row">
            <span className="credential-label">Username</span>
            <code>{order.credentials.user}</code>
            <button
              type="button"
              className="button ghost small"
              onClick={() => copy(order.credentials!.user, "user")}
            >
              {copied === "user" ? "Copied" : "Copy"}
            </button>
          </div>

          <div className="credential-row">
            <span className="credential-label">Password</span>
            <code>{order.credentials.password}</code>
            <button
              type="button"
              className="button ghost small"
              onClick={() => copy(order.credentials!.password, "pass")}
            >
              {copied === "pass" ? "Copied" : "Copy"}
            </button>
          </div>

          <p className="muted small">
            Bookmark this page — it is the only place these credentials are shown. We can reset the
            password at any time on request.
          </p>
        </div>
      ) : null}
    </section>
  );
}
