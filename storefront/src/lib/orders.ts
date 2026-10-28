import { ApiError, createServer, getCredentials, getServer } from "./rdpmonster";
import { decryptSecret, encryptSecret } from "./crypto";
import { getOrderByToken, updateOrder, type Order, type OrderStatus } from "./store";

const ORDER_STATUSES: OrderStatus[] = [
  "PENDING_PAYMENT",
  "PAID",
  "PROVISIONING",
  "ACTIVE",
  "FAILED",
  "CANCELLED",
];

function mapStatus(remote: string): OrderStatus {
  return (ORDER_STATUSES as string[]).includes(remote) ? (remote as OrderStatus) : "PROVISIONING";
}

export function orderLabel(order: Order): string {
  return `web-${order.id}`;
}

export async function provisionOrder(order: Order): Promise<Order> {
  if (order.status !== "PAID" || order.service_id) {
    return order;
  }

  try {
    const created = await createServer({
      plan: order.plan_sku,
      os: order.os,
      cycle: order.cycle,
      label: orderLabel(order),
      quantity: 1,
    });

    return updateOrder(order.id, {
      service_id: created.data.id,
      status: "PROVISIONING",
      error: null,
    });
  } catch (error) {
    const message =
      error instanceof ApiError
        ? error.isInsufficientBalance
          ? "Reseller balance is too low to fulfil this order. It will be retried once the balance is topped up."
          : error.message
        : "Unexpected provisioning error";
    return updateOrder(order.id, { status: "FAILED", error: message });
  }
}

export async function syncOrder(order: Order): Promise<Order> {
  if (!order.service_id) return order;
  if (order.status === "FAILED" || order.status === "CANCELLED") return order;
  if (order.status === "ACTIVE" && order.password_enc) return order;

  try {
    const server = await getServer(order.service_id);
    const ip = server.ips?.find((entry) => entry.primary)?.address ?? server.ips?.[0]?.address ?? null;

    let current = updateOrder(order.id, { status: mapStatus(server.status), primary_ip: ip });

    if (server.status === "ACTIVE" && !current.password_enc) {
      const credentials = await getCredentials(order.service_id);
      current = updateOrder(order.id, {
        status: "ACTIVE",
        username: credentials.user,
        password_enc: encryptSecret(credentials.password),
      });
    }

    return current;
  } catch (error) {
    const message = error instanceof ApiError ? error.message : "Status check failed";
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
    status: order.status,
    ip: order.primary_ip,
    error: order.error,
    createdAt: order.created_at,
    credentials: ready
      ? { user: order.username ?? "Administrator", password: decryptSecret(order.password_enc as string) }
      : null,
  };
}

export async function refreshByToken(token: string): Promise<Order | null> {
  const found = getOrderByToken(token);
  if (!found) return null;
  return syncOrder(found);
}
