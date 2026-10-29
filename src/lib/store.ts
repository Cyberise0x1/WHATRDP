import { getDatabase } from "@/lib/database";
import { OrderRepository } from "./storage/repository";
export type { Order, OrderStatus } from "./storage/types";

async function store() {
  return new OrderRepository(await getDatabase());
}
export { store as orderRepository };

export async function createOrder(input: Parameters<OrderRepository["create"]>[0]) {
  return (await store()).create(input);
}
export async function getOrderById(id: number) {
  return (await store()).byId(id);
}
export async function getOrderByToken(token: string) {
  return (await store()).byToken(token);
}
export async function getOrderByServiceId(id: string) {
  return (await store()).byService(id);
}
export async function getOrderByPaymentReference(id: string) {
  return (await store()).byPaymentReference(id);
}
export async function updateOrder(id: number, patch: Parameters<OrderRepository["update"]>[1]) {
  return (await store()).update(id, patch);
}
export async function recentOrders(limit = 50) {
  return (await store()).recent(limit);
}
export async function claimProvision(id: number) {
  return (await store()).claimProvision(id);
}
export async function claimPayment(
  id: number,
  reference: string,
  amount: number,
  currency = "USD",
) {
  return (await store()).claimPayment(id, reference, amount, currency);
}
