// Custom Worker entry: the OpenNext-generated worker only exports fetch, so
// Workflows and the scheduled reconciliation handler must be added here.
// The generated module does not exist until `npm run cf:build`.
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore -- resolved by wrangler after the OpenNext build
import { default as handler } from "./.open-next/worker.js";
import { reconcileOrders } from "./src/lib/reconcile";

export { ProvisionWorkflow } from "./src/workflows/provision";

// Re-exported for future DO queue / sharded tag cache use, matching the
// adapter's own worker template.
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore -- resolved by wrangler after the OpenNext build
export { DOQueueHandler, DOShardedTagCache } from "./.open-next/worker.js";

export default {
  fetch: handler.fetch,
  scheduled(
    _controller: unknown,
    env: CloudflareEnv,
    ctx: { waitUntil(promise: Promise<unknown>): void },
  ) {
    ctx.waitUntil(reconcileOrders(env));
  },
};
