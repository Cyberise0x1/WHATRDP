import { OrderRepository } from "./storage/repository";
import type { SqlDatabase } from "./storage/types";
import type { Server } from "./rdpmonster";
import { getCredentials, getServer } from "./rdpmonster";
import { encryptSecret } from "./crypto";
import { mapServerStatus } from "./order-status";

export interface WorkflowCreator {
  create(options: { id?: string; params?: unknown }): Promise<unknown>;
}

export interface ReconcileEnv {
  DB: SqlDatabase;
  PROVISION_WORKFLOW?: WorkflowCreator;
  PROVISIONING_ENABLED?: string;
  APP_SECRET: string;
  RDP_MONSTER_API_TOKEN: string;
  RDP_MONSTER_BASE_URL?: string;
}

export interface ReconcileDeps {
  repo?: OrderRepository;
  getServer?: (id: string, auth: { token: string; baseUrl?: string }) => Promise<Server>;
  getCredentials?: (
    id: string,
    auth: { token: string; baseUrl?: string },
  ) => Promise<{ user: string; password: string }>;
  encrypt?: (plain: string, secret?: string) => string;
  now?: () => Date;
  limit?: number;
  staleAfterMs?: number;
}

export interface ReconcileResult {
  scanned: number;
  dispatched: number;
  synced: number;
  reviewed: number;
}

const STALE_AFTER_MS = 10 * 60 * 1000;
const DEFAULT_LIMIT = 25;

/**
 * Bounded reconciliation run, scheduled every five minutes.
 *
 * - `PAID` past the cutoff: ask the Workflow to fulfil (only when provisioning
 *   is enabled). Duplicate dispatch is harmless because the instance id is
 *   deterministic.
 * - `PROVISIONING` with a service: sync the authoritative supplier status.
 * - `PROVISIONING` without a service past the cutoff: an interrupted claim. Mark
 *   it for review; never create again automatically.
 *
 * The query is limited per run so a backlog cannot exceed one invocation's budget.
 */
export async function reconcileOrders(
  env: ReconcileEnv,
  deps: ReconcileDeps = {},
): Promise<ReconcileResult> {
  const repo = deps.repo ?? new OrderRepository(env.DB);
  const fetchServer = deps.getServer ?? getServer;
  const fetchCredentials = deps.getCredentials ?? getCredentials;
  const encrypt = deps.encrypt ?? encryptSecret;
  const now = deps.now?.() ?? new Date();
  const limit = deps.limit ?? DEFAULT_LIMIT;
  const cutoff = new Date(now.getTime() - (deps.staleAfterMs ?? STALE_AFTER_MS)).toISOString();
  const auth = { token: env.RDP_MONSTER_API_TOKEN, baseUrl: env.RDP_MONSTER_BASE_URL };

  const result: ReconcileResult = { scanned: 0, dispatched: 0, synced: 0, reviewed: 0 };
  const stale = await repo.stale(cutoff, limit);

  for (const order of stale) {
    result.scanned += 1;

    if (order.status === "PAID") {
      if (env.PROVISIONING_ENABLED !== "true" || !env.PROVISION_WORKFLOW) continue;
      try {
        await env.PROVISION_WORKFLOW.create({
          id: `order-${order.id}`,
          params: { orderId: order.id },
        });
        result.dispatched += 1;
      } catch (error) {
        if (/already exists|duplicate/i.test(String(error))) result.dispatched += 1;
      }
      continue;
    }

    if (!order.service_id) {
      await repo.update(order.id, {
        status: "REVIEW_REQUIRED",
        error:
          "Provisioning intent has no linked service. Support must reconcile before any retry.",
      });
      result.reviewed += 1;
      continue;
    }

    try {
      const server = await fetchServer(order.service_id, auth);
      const ip =
        server.ips?.find((entry) => entry.primary)?.address ?? server.ips?.[0]?.address ?? null;
      let current = await repo.update(order.id, {
        status: mapServerStatus(server.status),
        primary_ip: ip,
      });
      if (server.status === "ACTIVE" && !current.password_enc) {
        const credentials = await fetchCredentials(order.service_id, auth);
        current = await repo.update(order.id, {
          status: "ACTIVE",
          username: credentials.user,
          password_enc: encrypt(credentials.password, env.APP_SECRET),
        });
      }
      result.synced += 1;
    } catch {
      // Read retries already ran inside the client; leave it for the next run.
    }
  }

  return result;
}
