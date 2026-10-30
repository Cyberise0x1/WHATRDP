import { createServer, getCredentials, getServer } from "./rdpmonster";
import { decryptSecret, encryptSecret } from "./crypto";
import {
  getOrderByToken,
  updateOrder,
  orderRepository,
  type Order,
  type OrderStatus,
} from "./store";
import { runProvisioning } from "./provisioning";

const ORDER_STATUSES: OrderStatus[] = [
  "PENDING_PAYMENT",
  "PAID",
  "PROVISIONING",
  "ACTIVE",
  "FAILED",
  "CANCELLED",
];

function mapStatus(remote: string): OrderStatus {
  if (remote === "TERMINATED") return "CANCELLED";
  if (remote === "EXPIRED" || remote === "SUSPENDED") return "FAILED";
  if (remote === "EXPIRING_SOON") return "ACTIVE";
  return (ORDER_STATUSES as string[]).includes(remote) ? (remote as OrderStatus) : "PROVISIONING";
}

export function orderLabel(order: Order): string {
  return `web-${order.token}`;
}

export async function provisionOrder(order: Order): Promise<Order> {
  if (process.env.PROVISIONING_ENABLED !== "true") {
    return order;
  }
  // Cloudflare's validated staging mode is intentionally not wired to paid creation.
  // Queue/outbox activation is a separate approval-gated cutover step.
  if (process.env.DEPLOYMENT_TARGET?.startsWith("cloudflare")) return order;
  return (await runProvisioning(await orderRepository(), order.id, createServer)) ?? order;
}

export async function syncOrder(order: Order, force = false): Promise<Order> {
  if (!order.service_id) return order;
  if (order.status === "FAILED" || order.status === "CANCELLED") return order;
  if (!force && order.status === "ACTIVE" && order.password_enc) return order;

  try {
    const server = await getServer(order.service_id);
    const ip =
      server.ips?.find((entry) => entry.primary)?.address ?? server.ips?.[0]?.address ?? null;

    let current = await updateOrder(order.id, { status: mapStatus(server.status), primary_ip: ip });

    if (server.status === "ACTIVE" && !current.password_enc) {
      const credentials = await getCredentials(order.service_id);
      current = await updateOrder(order.id, {
        status: "ACTIVE",
        username: credentials.user,
        password_enc: encryptSecret(credentials.password),
      });
    }

    return current;
  } catch {
    const message = "Status check failed. Contact support if this persists.";
    return updateOrder(order.id, { error: message });
  }
}

export function publicOrder(order: Order) {
  const ready = order.status === "ACTIVE" && order.password_enc;
  return {
    id: order.id,
    token: order.token,
    plan: order.plan_sku,
    os: order.os,
    cycle: order.cycle,
    amountCents: order.amount_cents,
    amountMinor: order.charge_amount_minor ?? order.amount_cents,
    currency: order.charge_currency ?? order.currency,
    status: order.status,
    ip: order.primary_ip,
    error: order.error,
    createdAt: order.created_at,
    credentials: ready
      ? {
          user: order.username ?? "Administrator",
          password: decryptSecret(order.password_enc as string),
        }
      : null,
  };
}

export async function refreshByToken(token: string): Promise<Order | null> {
  const found = await getOrderByToken(token);
  if (!found) return null;
  return syncOrder(found);
}
