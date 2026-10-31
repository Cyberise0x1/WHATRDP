// Hand-maintained Cloudflare binding types.
//
// `wrangler types` output is deliberately NOT committed: it narrows
// `process.env.PROVISIONING_ENABLED` to the literal `"false"` (TS2367 in
// src/lib/orders.ts) and imports `.open-next/worker`, which does not exist when
// `npm run typecheck` runs before the build in CI. Binding drift is guarded by
// the "wrangler bindings match" test in tests/unit/deployment.test.ts.
import type { SqlDatabase } from "./src/lib/storage/types";

declare global {
  interface ProvisionWorkflowBinding {
    create(options: { id?: string; params?: unknown }): Promise<unknown>;
  }

  interface CheckoutRateLimiter {
    limit(options: { key: string }): Promise<{ success: boolean }>;
  }

  interface CloudflareEnv {
    DB: SqlDatabase;
    PROVISION_WORKFLOW: ProvisionWorkflowBinding;
    CHECKOUT_RATE_LIMIT?: CheckoutRateLimiter;
    APP_SECRET: string;
    RDP_MONSTER_API_TOKEN: string;
    RDP_MONSTER_BASE_URL?: string;
    TURNSTILE_SITE_KEY?: string;
    // A runtime string, never a literal, so the 503 gate cannot be constant-folded.
    PROVISIONING_ENABLED?: string;
  }
}
