import { OrderRepository } from "./storage/repository";
import type { Order, SqlDatabase } from "./storage/types";
import type { Server } from "./rdpmonster";
import { getCredentials, getServer } from "./rdpmonster";
import { encryptSecret } from "./crypto";
import { mapServerStatus } from "./order-status";
import { raiseAlert } from "./alerts";
import { deliverCredentialsEmail, type DeliveryOutcome, type EmailBinding } from "./email";

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
  EMAIL?: EmailBinding;
  EMAIL_FROM?: string;
  PUBLIC_BASE_URL?: string;
}

export interface ReconcileDeps {
  repo?: OrderRepository;
  getServer?: (id: string, auth: { token: string; baseUrl?: string }) => Promise<Server>;
  getCredentials?: (
    id: string,
    auth: { token: string; baseUrl?: string },
  ) => Promise<{ user: string; password: string }>;
  encrypt?: (plain: string, secret?: string) => string;
  deliverCredentials?: (order: Order) => Promise<DeliveryOutcome> | DeliveryOutcome;
  now?: () => Date;
  limit?: number;
  staleAfterMs?: number;
}

export interface ReconcileResult {
  scanned: number;
  dispatched: number;
  synced: number;
  reviewed: number;
  emailed: number;
}

const STALE_AFTER_MS = 10 * 60 * 1000;
const EMAIL_RETRY_AFTER_MS = 15 * 60 * 1000;
const EMAIL_BUCKET = 5;
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
  const nowDate = deps.now?.() ?? new Date();
  const limit = deps.limit ?? DEFAULT_LIMIT;
  const cutoff = new Date(nowDate.getTime() - (deps.staleAfterMs ?? STALE_AFTER_MS)).toISOString();
  const auth = { token: env.RDP_MONSTER_API_TOKEN, baseUrl: env.RDP_MONSTER_BASE_URL };

  const deliver =
    deps.deliverCredentials ??
    ((order: Order) => deliverCredentialsEmail(env, repo, order, { now: deps.now }));

  const result: ReconcileResult = { scanned: 0, dispatched: 0, synced: 0, reviewed: 0, emailed: 0 };
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
        if (/already exists|duplicate/i.test(String(error))) {
          result.dispatched += 1;
        } else {
          raiseAlert({
            code: "provision_dispatch_failed",
            severity: "critical",
            message: "The provisioning Workflow could not be dispatched for a paid order",
            context: { orderId: order.id },
          });
        }
      }
      continue;
    }

    if (!order.service_id) {
      raiseAlert({
        code: "provisioning_review_required",
        severity: "critical",
        message: "Provisioning was interrupted before a service was linked",
        context: { orderId: order.id },
      });
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
      const status = mapServerStatus(server.status);
      let current = await repo.update(order.id, {
        status,
        primary_ip: ip,
      });
      if (status === "FAILED") {
        raiseAlert({
          code: "provisioning_failed",
          severity: "critical",
          message: "The supplier reported a failed server during reconciliation",
          context: { orderId: order.id, supplierStatus: server.status },
        });
      }
      if (server.status === "ACTIVE" && !current.password_enc) {
        const credentials = await fetchCredentials(order.service_id, auth);
        const stored = await repo.claimCredentials(
          order.id,
          credentials.user,
          encrypt(credentials.password, env.APP_SECRET),
        );
        if (stored) {
          current = stored;
          await deliver(stored);
        } else {
          current = (await repo.byId(order.id)) ?? current;
        }
      }
      result.synced += 1;
    } catch {
      // Read retries already ran inside the client; leave it for the next run,
      // but make a persistent failure visible without alerting every five
      // minutes.
      raiseAlert({
        code: "reconcile_sync_failed",
        severity: "warning",
        message: "A provisioning order could not be re-synced",
        context: { orderId: order.id },
        cooldownMs: 60 * 60 * 1000,
      });
    }
  }

  // Credentials can be stored by the request path, which cannot reach the
  // Email binding. Sweep those orders here with the same bounded retry rule.
  const emailCutoff = new Date(nowDate.getTime() - EMAIL_RETRY_AFTER_MS).toISOString();
  const pending = await repo.pendingCredentialEmails(emailCutoff, EMAIL_BUCKET);
  for (const order of pending) {
    if ((await deliver(order)) === "sent") result.emailed += 1;
  }

  return result;
}
