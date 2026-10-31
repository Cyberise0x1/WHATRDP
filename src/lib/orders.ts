import { getCredentials, getServer } from "./rdpmonster";
import { decryptSecret, encryptSecret } from "./crypto";
import { getOrderByToken, updateOrder, type Order } from "./store";
import { mapServerStatus } from "./order-status";

export function orderLabel(order: Order): string {
  return `web-${order.token}`;
}

export async function syncOrder(order: Order, force = false): Promise<Order> {
  if (!order.service_id) return order;
  if (order.status === "FAILED" || order.status === "CANCELLED") return order;
  if (!force && order.status === "ACTIVE" && order.password_enc) return order;

  try {
    const server = await getServer(order.service_id);
    const ip =
      server.ips?.find((entry) => entry.primary)?.address ?? server.ips?.[0]?.address ?? null;

    let current = await updateOrder(order.id, {
      status: mapServerStatus(server.status),
      primary_ip: ip,
    });

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
