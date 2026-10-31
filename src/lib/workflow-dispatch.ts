import { getCloudflareContext } from "@opennextjs/cloudflare";

interface WorkflowBinding {
  create(options: { id?: string; params?: unknown }): Promise<unknown>;
}

/**
 * Ask the provisioning Workflow to fulfil a settled order.
 *
 * Returns false without throwing when provisioning is disabled, when running
 * outside the Worker runtime, or when the binding is absent. Callers must not
 * roll back settlement on a false result; the order stays PAID for reconciliation.
 */
export async function startProvisionWorkflow(orderId: number): Promise<boolean> {
  if (process.env.PROVISIONING_ENABLED !== "true") return false;

  try {
    const { env } = await getCloudflareContext({ async: true });
    const binding = (env as { PROVISION_WORKFLOW?: WorkflowBinding }).PROVISION_WORKFLOW;
    if (!binding) return false;

    try {
      // A deterministic id makes duplicate dispatches harmless.
      await binding.create({ id: `order-${orderId}`, params: { orderId } });
      return true;
    } catch (error) {
      if (/already exists|duplicate/i.test(String(error))) return true;
      return false;
    }
  } catch {
    return false;
  }
}
