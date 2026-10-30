import { resolve } from "node:path";

type Environment = "staging" | "production";
type Variables = Record<string, string | undefined>;

export function deploymentConfig(target: string, vars: Variables, base: Record<string, unknown>) {
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
  return {
    ...base,
    name,
    main: resolve(".open-next/worker.js"),
    assets: { directory: resolve(".open-next/assets"), binding: "ASSETS" },
    d1_databases: [
      {
        binding: "DB",
        database_name: databaseName,
        database_id: id,
        migrations_dir: resolve("migrations"),
      },
    ],
    vars: { PROVISIONING_ENABLED: "false", DEPLOYMENT_TARGET: `cloudflare-${environment}` },
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
