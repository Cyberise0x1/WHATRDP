// Hand-maintained Cloudflare binding types.
//
// `wrangler types` output is deliberately NOT committed: it narrows
// `process.env.PROVISIONING_ENABLED` to the literal `"false"` (TS2367 in
// src/lib/orders.ts) and imports `.open-next/worker`, which does not exist when
// `npm run typecheck` runs before the build in CI. Binding drift is guarded by
// the "wrangler bindings match" test in tests/unit/deployment.test.ts.
import type { SqlDatabase } from "./src/lib/storage/types";

declare global {
  interface CloudflareEnv {
    DB: SqlDatabase;
  }
}
