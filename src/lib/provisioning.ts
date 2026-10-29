import type { OrderRepository } from "./storage/repository";
import type { Server } from "./rdpmonster";

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
    // A network error or upstream 5xx can occur AFTER the supplier charges us.
    // Never automatically retry creation after such an outcome.
    const status =
      typeof error === "object" && error !== null && "status" in error ? Number(error.status) : 0;
    const certainRejection = status >= 400 && status < 500 && status !== 408;
    return store.update(id, {
      status: certainRejection ? "FAILED" : "REVIEW_REQUIRED",
      error:
        status === 402
          ? "Supplier credit is insufficient. Support must review fulfilment."
          : certainRejection
            ? "Supplier rejected this order. Contact support."
            : "Supplier creation outcome is uncertain. Support must reconcile before any retry.",
    });
  }
}
