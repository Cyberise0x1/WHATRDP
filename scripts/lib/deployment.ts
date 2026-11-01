import { resolve } from "node:path";

export type Environment = "staging" | "production";
type Variables = Record<string, string | undefined>;

// The only place fulfilment is enabled. Both entries stay false until:
//   staging    — supplier balance funded, reseller products defined, reserve set
//   production — one staging order verified end to end and the D-024 guard removed
// Changing an entry is a reviewed code change, never configuration (D-019/D-026).
export const FULFILMENT_ENABLED: Record<Environment, boolean> = {
  staging: false,
  production: false,
};

export function provisioningEnabled(
  environment: Environment,
  flags: Record<Environment, boolean> = FULFILMENT_ENABLED,
): "true" | "false" {
  return flags[environment] ? "true" : "false";
}

export function deploymentConfig(
  target: string,
  vars: Variables,
  base: Record<string, unknown>,
  fulfilment: Record<Environment, boolean> = FULFILMENT_ENABLED,
) {
  if (target !== "staging" && target !== "production")
    throw new Error("Unknown deployment environment");
  if (vars.DEPLOYMENT_APPROVED !== "true") throw new Error("Deployment is not approved");
  const environment: Environment = target;
  const prefix = environment.toUpperCase();
  const name = vars[`${prefix}_WORKER_NAME`] ?? "";
  const id = vars[`${prefix}_D1_DATABASE_ID`] ?? "";
  const databaseName = vars[`${prefix}_D1_DATABASE_NAME`] ?? "";
  if (
    !new RegExp(`^[a-z0-9-]+-${environment}$`).test(name) ||
    !new RegExp(`^[a-z0-9-]+-${environment}$`).test(databaseName)
  ) {
    throw new Error("Worker and database names must identify the chosen environment");
  }
  if (!/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(id) || id.startsWith("00000000-")) {
    throw new Error("An approved, non-placeholder D1 database ID is required");
  }
  const other = vars[`${environment === "staging" ? "PRODUCTION" : "STAGING"}_D1_DATABASE_ID`];
  if (other === id || (environment === "production" && !other)) {
    throw new Error("Staging and production require different databases");
  }
  const hostname = vars[`${prefix}_HOSTNAME`]?.trim();
  if (
    hostname &&
    !/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i.test(hostname)
  ) {
    throw new Error("An approved custom hostname must be a bare DNS name");
  }
  const publicBaseUrl = vars[`${prefix}_PUBLIC_BASE_URL`]?.trim() ?? "";
  if (publicBaseUrl) {
    let parsed: URL;
    try {
      parsed = new URL(publicBaseUrl);
    } catch {
      throw new Error("An approved public base URL must be a bare https:// origin");
    }
    if (parsed.protocol !== "https:" || parsed.origin !== publicBaseUrl) {
      throw new Error("An approved public base URL must be a bare https:// origin");
    }
  }
  return {
    ...base,
    name,
    // The custom entry re-exports the generated fetch handler and adds the
    // provisioning Workflow class.
    main: resolve("custom-worker.ts"),
    assets: { directory: resolve(".open-next/assets"), binding: "ASSETS" },
    d1_databases: [
      {
        binding: "DB",
        database_name: databaseName,
        database_id: id,
        migrations_dir: resolve("migrations"),
      },
    ],
    // Per-IP checkout limiter; environment-specific namespaces so one environment
    // cannot consume the other's budget.
    ratelimits: [
      {
        name: "CHECKOUT_RATE_LIMIT",
        namespace_id: environment === "staging" ? "1001" : "1002",
        simple: { limit: 5, period: 60 },
      },
    ],
    // Bounded reconciliation of stuck PAID/PROVISIONING orders every five minutes.
    triggers: { crons: ["*/5 * * * *"] },
    // Per-environment Workflow; the class is exported from custom-worker.ts.
    workflows: [
      {
        name: `${name}-provision`,
        binding: "PROVISION_WORKFLOW",
        class_name: "ProvisionWorkflow",
      },
    ],
    vars: {
      PROVISIONING_ENABLED: provisioningEnabled(environment, fulfilment),
      DEPLOYMENT_TARGET: `cloudflare-${environment}`,
      // Public site key; the secret is a Worker secret set out of band.
      TURNSTILE_SITE_KEY: vars.TURNSTILE_SITE_KEY?.trim() ?? "",
      // Cloudflare Email Service sender and the origin used in order links.
      EMAIL_FROM: vars.EMAIL_FROM?.trim() ?? "",
      PUBLIC_BASE_URL: publicBaseUrl,
    },
    // A configured hostname becomes a custom domain and the public
    // *.workers.dev route is disabled. Without one, the Worker stays on
    // workers.dev only (preview) — production should always set a hostname.
    workers_dev: !hostname,
    routes: hostname ? [{ pattern: hostname, custom_domain: true }] : [],
  };
}

export function hasRequiredReviewers(environment: unknown): boolean {
  if (!environment || typeof environment !== "object") return false;
  const rules = (environment as { protection_rules?: unknown }).protection_rules;
  return (
    Array.isArray(rules) &&
    rules.some(
      (rule) =>
        rule?.type === "required_reviewers" &&
        Array.isArray(rule.reviewers) &&
        rule.reviewers.length > 0,
    )
  );
}
