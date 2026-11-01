// Custom Worker entry: the OpenNext-generated worker only exports fetch, so
// Workflows and the scheduled reconciliation handler must be added here.
// The generated module does not exist until `npm run cf:build`.
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore -- resolved by wrangler after the OpenNext build
import { default as handler } from "./.open-next/worker.js";
import { reconcileOrders } from "./src/lib/reconcile";
import { checkBackupFreshness } from "./src/lib/backup-freshness";
import { setAlertBackgroundScheduler } from "./src/lib/alerts";

export { ProvisionWorkflow } from "./src/workflows/provision";

// Re-exported for future DO queue / sharded tag cache use, matching the
// adapter's own worker template.
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore -- resolved by wrangler after the OpenNext build
export { DOQueueHandler, DOShardedTagCache } from "./.open-next/worker.js";

type ExecutionContext = { waitUntil(promise: Promise<unknown>): void };

export default {
  // Installing the scheduler per invocation lets deep library code keep alert
  // delivery alive after the response without awaiting the webhook itself.
  fetch(request: Request, env: CloudflareEnv, ctx: ExecutionContext) {
    setAlertBackgroundScheduler((task) => ctx.waitUntil(task));
    return handler.fetch(request, env, ctx);
  },
  scheduled(_controller: unknown, env: CloudflareEnv, ctx: ExecutionContext) {
    setAlertBackgroundScheduler((task) => ctx.waitUntil(task));
    ctx.waitUntil(reconcileOrders(env));
    ctx.waitUntil(checkBackupFreshness(env.DB, env.DEPLOYMENT_TARGET));
  },
};
