import type { OrderStatus } from "./storage/types";

// Kept separate from orders.ts so the Workflow bundle never reaches the
// Node/D1 database selector or any other request-context module.
const KNOWN: OrderStatus[] = [
  "PENDING_PAYMENT",
  "PAID",
  "PROVISIONING",
  "ACTIVE",
  "FAILED",
  "CANCELLED",
  "REVIEW_REQUIRED",
];

export function mapServerStatus(remote: string): OrderStatus {
  if (remote === "TERMINATED") return "CANCELLED";
  if (remote === "EXPIRED" || remote === "SUSPENDED") return "FAILED";
  if (remote === "EXPIRING_SOON") return "ACTIVE";
  return (KNOWN as string[]).includes(remote) ? (remote as OrderStatus) : "PROVISIONING";
}
