import type { WorkflowStep } from "cloudflare:workers";
import type { OrderRepository } from "./storage/repository";
import type { Order } from "./storage/types";
import type { Server, SupplierAuth } from "./rdpmonster";
import { classifyCreateFailure } from "./provisioning";
import { mapServerStatus } from "./order-status";

// Both the Cloudflare Workflow and the unit tests drive this sequence. The
// Workflow supplies the real step implementation; tests supply an immediate one.
export interface ProvisionEnv {
  PROVISIONING_ENABLED?: string;
  APP_SECRET: string;
  RDP_MONSTER_API_TOKEN: string;
  RDP_MONSTER_BASE_URL?: string;
}

export interface ProvisionDeps {
  repo: OrderRepository;
  create: (
    payload: Record<string, unknown>,
    auth: SupplierAuth,
  ) => Promise<{ data: { id: string } }>;
  getServer: (id: string, auth: SupplierAuth) => Promise<Server>;
  getCredentials: (id: string, auth: SupplierAuth) => Promise<{ user: string; password: string }>;
  encrypt: (plain: string, secret?: string) => string;
  step: WorkflowStep;
  pollAttempts?: number;
  pollDelay?: string;
}

const TERMINAL = ["FAILED", "TERMINATED", "EXPIRED", "SUSPENDED", "CANCELLED"];

export async function runProvisionFlow(
  env: ProvisionEnv,
  orderId: number,
  deps: ProvisionDeps,
): Promise<string> {
  if (env.PROVISIONING_ENABLED !== "true") return "disabled";

  const { repo, step } = deps;
  const auth: SupplierAuth = {
    token: env.RDP_MONSTER_API_TOKEN,
    baseUrl: env.RDP_MONSTER_BASE_URL,
  };

  const order = await step.do("load order", () => repo.byId(orderId));
  if (!order || order.status !== "PAID") return "skipped";

  // Persist intent before the billable request. The conditional UPDATE is the
  // at-most-once guard: any later run loses this claim and returns.
  const claimed = await step.do("claim provisioning", { retries: { limit: 0 } }, () =>
    repo.claimProvision(order.id),
  );
  if (!claimed) return "claimed_elsewhere";

  const created = await step.do(
    "create server",
    { retries: { limit: 0 }, timeout: "2 minutes" },
    async () => {
      try {
        const response = await deps.create(
          {
            plan: claimed.plan_sku,
            os: claimed.os,
            cycle: claimed.cycle,
            label: `web-${claimed.token}`,
            quantity: 1,
          },
          auth,
        );
        return { ok: true as const, id: response.data.id };
      } catch (error) {
        // Never let this step throw: an uncertain outcome must be recorded,
        // not retried by the Workflow engine.
        return { ok: false as const, ...classifyCreateFailure(error) };
      }
    },
  );

  if (!created.ok) {
    await step.do("record creation failure", { retries: { limit: 0 } }, () =>
      repo.update(claimed.id, {
        status: created.certainRejection ? "FAILED" : "REVIEW_REQUIRED",
        error: created.message,
      }),
    );
    return created.certainRejection ? "failed" : "review_required";
  }

  let current: Order = await step.do("persist service id", { retries: { limit: 0 } }, () =>
    repo.update(claimed.id, { service_id: created.id, error: null }),
  );

  const attempts = deps.pollAttempts ?? 30;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    await step.sleep(`wait for activation ${attempt}`, deps.pollDelay ?? "10 seconds");
    const snapshot = await step.do(
      `fetch server ${attempt}`,
      { retries: { limit: 2 } },
      async () => {
        const server = await deps.getServer(created.id, auth);
        return {
          status: server.status,
          ip:
            server.ips?.find((entry) => entry.primary)?.address ?? server.ips?.[0]?.address ?? null,
        };
      },
    );
    current = await step.do(`record status ${attempt}`, { retries: { limit: 0 } }, () =>
      repo.update(claimed.id, {
        status: mapServerStatus(snapshot.status),
        primary_ip: snapshot.ip,
      }),
    );
    if (snapshot.status === "ACTIVE" || TERMINAL.includes(snapshot.status)) break;
  }

  if (current.status === "ACTIVE" && !current.password_enc) {
    const credentials = await step.do("fetch credentials", { retries: { limit: 2 } }, () =>
      deps.getCredentials(created.id, auth),
    );
    await step.do("store credentials", { retries: { limit: 0 } }, () =>
      repo.update(claimed.id, {
        username: credentials.user,
        password_enc: deps.encrypt(credentials.password, env.APP_SECRET),
      }),
    );
  }

  // A paid order whose server is still provisioning is left for the
  // reconciliation job; it is never marked failed here.
  return current.status === "ACTIVE" ? "active" : "provisioning";
}
