import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from "cloudflare:workers";
import { OrderRepository } from "../lib/storage/repository";
import type { SqlDatabase } from "../lib/storage/types";
import { createServer, getCredentials, getServer } from "../lib/rdpmonster";
import { encryptSecret } from "../lib/crypto";
import { runProvisionFlow, type ProvisionEnv } from "../lib/provision-flow";

interface ProvisionWorkflowEnv extends ProvisionEnv {
  DB: SqlDatabase;
}

interface ProvisionParams {
  orderId: number;
}

// Durable fulfilment. Creation runs with retries disabled and intent is claimed
// before the billable POST /servers. The class is exported from custom-worker.ts.
export class ProvisionWorkflow extends WorkflowEntrypoint<ProvisionWorkflowEnv, ProvisionParams> {
  async run(event: WorkflowEvent<ProvisionParams>, step: WorkflowStep) {
    return runProvisionFlow(this.env, event.payload.orderId, {
      repo: new OrderRepository(this.env.DB),
      create: createServer,
      getServer,
      getCredentials,
      encrypt: encryptSecret,
      step,
    });
  }
}
