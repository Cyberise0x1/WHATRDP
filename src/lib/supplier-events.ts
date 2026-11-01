export type SupplierEventKind = "sync" | "expiring" | "invoice" | "payment_failed" | "unknown";

/**
 * Map the provider's documented webhook events to the action the route takes.
 * `server.delivered` is kept for compatibility even though the panel currently
 * lists `server.created` instead.
 */
export function classifySupplierEvent(event: string | undefined): SupplierEventKind {
  switch (event) {
    case "server.created":
    case "server.delivered":
    case "server.renewed":
    case "server.suspended":
    case "server.deleted":
      return "sync";
    case "service.expiring":
      return "expiring";
    case "invoice.created":
    case "invoice.paid":
      return "invoice";
    case "payment.failed":
      return "payment_failed";
    default:
      return "unknown";
  }
}
