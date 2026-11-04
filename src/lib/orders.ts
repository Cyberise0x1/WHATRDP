import { getCredentials, getServer, isMissingServerError } from "./rdpmonster";
import { decryptSecret, encryptSecret } from "./crypto";
import { POWER_REFRESH_INTERVAL_MS } from "./power-actions";
import { claimCredentials, getOrderById, getOrderByToken, updateOrder, type Order } from "./store";
import { mapServerStatus } from "./order-status";

export function orderLabel(order: Order): string {
  return `web-${order.token}`;
}

export interface RefreshedOrder {
  order: Order;
  power: string | null;
}

export const SERVER_GONE_MESSAGE =
  "This server is no longer available. It was cancelled or removed.";

export function cancelMissingOrder(orderId: number): Promise<Order> {
  return updateOrder(orderId, {
    status: "CANCELLED",
    primary_ip: null,
    power_state: null,
    power_checked_at: null,
    username: null,
    password_enc: null,
    error: SERVER_GONE_MESSAGE,
  });
}

export function powerStateIsFresh(order: Order, now = Date.now()): boolean {
  if (!order.power_checked_at) return false;
  const checked = Date.parse(order.power_checked_at);
  return Number.isFinite(checked) && now - checked < POWER_REFRESH_INTERVAL_MS;
}

export async function refreshOrderState(
  order: Order,
  force = false,
  options: { recordError?: boolean } = {},
): Promise<RefreshedOrder> {
  if (!order.service_id) return { order, power: order.power_state };
  if (order.status === "FAILED" || order.status === "CANCELLED") {
    return { order, power: order.power_state };
  }
  if (!force && order.status === "ACTIVE" && order.password_enc) {
    return { order, power: order.power_state };
  }

  let current = order;

  try {
    const server = await getServer(order.service_id);
    const ip =
      server.ips?.find((entry) => entry.primary)?.address ?? server.ips?.[0]?.address ?? null;

    current = await updateOrder(order.id, {
      status: mapServerStatus(server.status),
      primary_ip: ip,
      power_state: server.power ?? null,
      power_checked_at: new Date().toISOString(),
    });

    if (server.status === "ACTIVE" && !current.password_enc) {
      const credentials = await getCredentials(order.service_id);
      current =
        (await claimCredentials(order.id, credentials.user, encryptSecret(credentials.password))) ??
        (await getOrderById(order.id)) ??
        current;
    }

    return { order: current, power: server.power ?? null };
  } catch (error) {
    if (isMissingServerError(error)) {
      return { order: await cancelMissingOrder(order.id), power: null };
    }
    // An optional power refresh on a live order keeps its cached or partially
    // updated state instead of surfacing a transient supplier failure.
    if (order.status === "ACTIVE" && options.recordError === false) {
      return { order: current, power: current.power_state };
    }
    const message = "Status check failed. Contact support if this persists.";
    const updated = await updateOrder(order.id, { error: message });
    return { order: updated, power: updated.power_state };
  }
}

export async function syncOrder(order: Order, force = false): Promise<Order> {
  return (await refreshOrderState(order, force)).order;
}

export function publicOrder(order: Order, power: string | null = order.power_state) {
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
    power,
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
