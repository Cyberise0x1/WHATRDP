import type { OrderRepository } from "./storage/repository";
import type { Server } from "./rdpmonster";
import { raiseAlert } from "./alerts";

export interface CreateFailure {
  certainRejection: boolean;
  message: string;
  customerMessage: string;
}

/** Shared by the inline Node path and the provisioning Workflow. */
export function classifyCreateFailure(error: unknown): CreateFailure {
  // A network error or upstream 5xx can occur AFTER the supplier charges us,
  // so only a definite 4xx (excluding 408) is a rejection.
  const status =
    typeof error === "object" && error !== null && "status" in error
      ? Number((error as { status: unknown }).status)
      : 0;
  const certainRejection = status >= 400 && status < 500 && status !== 408;
  return {
    certainRejection,
    message:
      status === 402
        ? "Supplier credit is insufficient. Support must review fulfilment."
        : certainRejection
          ? "Supplier rejected this order. Contact support."
          : "Supplier creation outcome is uncertain. Support must reconcile before any retry.",
    customerMessage:
      status === 402
        ? "This order cannot be provisioned right now. Support must review it."
        : certainRejection
          ? "This order was rejected. Contact support."
          : "Provisioning is under review. Contact support before retrying.",
  };
}

export async function runProvisioning(
  store: OrderRepository,
  id: number,
  create: (payload: Record<string, unknown>) => Promise<{ data: Server }>,
) {
  const claimed = await store.claimProvision(id);
  if (!claimed) return store.byId(id);
  try {
    const response = await create({
      plan: claimed.plan_sku,
      os: claimed.os,
      cycle: claimed.cycle,
      label: `web-${claimed.token}`, // Unique across independent local/staging/production DBs.
      quantity: 1,
    });
    return await store.update(id, { service_id: response.data.id, error: null });
  } catch (error) {
    const failure = classifyCreateFailure(error);
    raiseAlert({
      code: failure.certainRejection ? "provisioning_failed" : "provisioning_review_required",
      severity: "critical",
      message: failure.message,
      context: { orderId: id, certainRejection: failure.certainRejection },
    });
    return store.update(id, {
      status: failure.certainRejection ? "FAILED" : "REVIEW_REQUIRED",
      error: failure.customerMessage,
    });
  }
}
