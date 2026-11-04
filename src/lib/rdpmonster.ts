import { raiseAlert } from "./alerts";
import type { PowerAction } from "./power-actions";

export interface CatalogPlan {
  sku: string;
  name: string;
  product: string;
  region: string;
  tier: string;
  cpuCores: number;
  ramMb: number;
  diskGb: number;
  ipv4Count: number;
  priceCents: Record<string, number>;
}

export interface CatalogOs {
  slug: string;
  name: string;
  family: "WINDOWS" | "LINUX";
}

export interface ResellerTier {
  key: string;
  discountPercent: number;
  turnover30dCents: number;
  nextTier: { key: string; minCents: number; discountPercent: number } | null;
  ladder: { key: string; minCents: number; percent: number }[];
}

export interface Catalog {
  products: { slug: string; name: string; family: string }[];
  regions: { slug: string; name: string }[];
  plans: CatalogPlan[];
  os: CatalogOs[];
  resellerTier: ResellerTier;
  resellerProducts: unknown[];
}

export interface ServerIp {
  id: string;
  address: string;
  version: number;
  primary: boolean;
}

export interface Server {
  id: string;
  label: string | null;
  status: string;
  power: string;
  product: string | null;
  plan: string | null;
  resellerProduct: string | null;
  region: string | null;
  tier: string | null;
  os: { slug: string; name: string; family: string } | null;
  resources: { cpuCores: number; ramMb: number; diskGb: number; ipv4Count: number };
  ips: ServerIp[];
  cycle: string;
  priceCents: number;
  autoRenew: boolean;
  expiresAt: string | null;
  tags?: string[];
  type?: string;
}

export interface ApiErrorBody {
  error?: string;
  message?: string;
  ref?: string;
}

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code: string,
    public readonly ref?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }

  get isAuthError(): boolean {
    return this.status === 401 || this.status === 403;
  }

  get isInsufficientBalance(): boolean {
    return this.status === 402 || this.code === "insufficient_balance";
  }
}

export interface SupplierAuth {
  token: string;
  baseUrl?: string;
}

/** The supplier has no such server: it was deleted or cancelled, not a transient fault. */
export function isMissingServerError(error: unknown): boolean {
  return error instanceof ApiError && error.status === 404;
}

function baseUrl(auth?: SupplierAuth): string {
  const raw =
    auth?.baseUrl?.trim() ||
    process.env.RDP_MONSTER_BASE_URL?.trim() ||
    "https://dashboard.rdp.monster/api/v1";
  const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  return withScheme.replace(/\/$/, "").replace(/\/api\/v1$/, "") + "/api/v1";
}

function token(auth?: SupplierAuth): string {
  const value = (auth?.token ?? process.env.RDP_MONSTER_API_TOKEN)?.trim();
  if (!value) {
    raiseAlert({
      code: "supplier_token_missing",
      severity: "critical",
      message: "RDP_MONSTER_API_TOKEN is not configured",
    });
    throw new ApiError("RDP_MONSTER_API_TOKEN is not configured", 0, "missing_token");
  }
  return value;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function api<T>(
  path: string,
  init: RequestInit = {},
  options: { retries?: number; auth?: SupplierAuth } = {},
): Promise<T> {
  const method = (init.method ?? "GET").toUpperCase();
  const retries = method === "GET" ? Math.min(3, Math.max(0, options.retries ?? 2)) : 0;
  let attempt = 0;

  while (true) {
    attempt += 1;
    let response: Response;
    try {
      response = await fetch(`${baseUrl(options.auth)}${path}`, {
        ...init,
        cache: "no-store",
        signal: init.signal ?? AbortSignal.timeout(10_000),
        headers: {
          Authorization: `Bearer ${token(options.auth)}`,
          Accept: "application/json",
          "Content-Type": "application/json",
          "User-Agent": "rdpmonster-storefront/1.0",
          ...(init.headers ?? {}),
        },
      });
    } catch (error) {
      if (method === "GET" && attempt <= retries) {
        await sleep(250 * 2 ** (attempt - 1));
        continue;
      }
      raiseAlert({
        code: "supplier_unreachable",
        severity: "critical",
        message: "The supplier API could not be reached",
        context: { method, path },
      });
      throw error;
    }

    if (response.ok) {
      return (await response.json()) as T;
    }

    let body: ApiErrorBody = {};
    try {
      body = (await response.json()) as ApiErrorBody;
    } catch {
      body = {};
    }

    const code = body.error ?? "";
    const message = body.message ?? code ?? `HTTP ${response.status}`;

    if (method === "GET" && response.status === 429 && attempt <= retries) {
      const retryAfter = Number(response.headers.get("retry-after") ?? 2);
      await sleep(Math.min(30_000, Math.max(1000, retryAfter * 1000)));
      continue;
    }

    if (method === "GET" && response.status >= 500 && attempt <= retries) {
      await sleep(250 * 2 ** (attempt - 1));
      continue;
    }

    // Retries are exhausted (or the request is a write): this is the failure an
    // operator needs to see. Never include the response body or request data.
    const context = { status: response.status, method, path };
    if (response.status === 401 || response.status === 403) {
      raiseAlert({
        code: "supplier_auth_failed",
        severity: "critical",
        message: "The supplier API rejected our credentials",
        context,
      });
    } else if (response.status === 402 || code === "insufficient_balance") {
      raiseAlert({
        code: "supplier_balance_exhausted",
        severity: "critical",
        message: "The supplier balance is insufficient for this request",
        context,
      });
    } else if (response.status >= 500) {
      raiseAlert({
        code: "supplier_5xx",
        severity: "warning",
        message: "The supplier API returned a server error",
        context,
      });
    }

    throw new ApiError(message, response.status, code, body.ref);
  }
}

export async function getCatalog(): Promise<Catalog> {
  const response = await api<{ data: Catalog }>("/catalog", {}, { retries: 2 });
  return response.data;
}

export interface Account {
  email: string;
  balanceCents: number;
  activeServices: number;
  unpaidInvoices: number;
  unpaidCents: number;
  reseller: { tier: string; discountPercent: number; turnover30dCents: number } | null;
  rateLimitPerMinute: number;
}

export async function getAccount(auth?: SupplierAuth): Promise<Account> {
  const response = await api<{ data: Account }>("/account", {}, { auth });
  return response.data;
}

export async function getServer(id: string, auth?: SupplierAuth): Promise<Server> {
  const response = await api<{ data: Server }>(`/servers/${encodeURIComponent(id)}`, {}, { auth });
  return response.data;
}

export async function findServerByLabel(
  label: string,
  waitMs = 15_000,
  auth?: SupplierAuth,
): Promise<Server | null> {
  if (!label) return null;
  const deadline = Date.now() + Math.max(0, waitMs);
  const perPage = 200;
  const maxPages = 50; // 10,000 servers; a documented bound, not a silent ceiling.

  do {
    for (let page = 1; page <= maxPages; page += 1) {
      const response = await api<{ data: Server[]; meta?: { total?: number } }>(
        `/servers?perPage=${perPage}&page=${page}`,
        {},
        { auth },
      );
      const match = response.data.find((server) => server.label === label);
      if (match) return match;
      const total = response.meta?.total;
      if (!total || response.data.length < perPage || page * perPage >= total) break;
    }
    if (Date.now() >= deadline) break;
    await sleep(3000);
  } while (Date.now() < deadline);

  return null;
}

export async function createServer(
  payload: Record<string, unknown>,
  auth?: SupplierAuth,
): Promise<{
  data: Server;
  servers?: Server[];
  invoice?: { id: string; totalCents: number } | null;
  recovered?: boolean;
}> {
  try {
    return await api(
      "/servers",
      {
        method: "POST",
        body: JSON.stringify(payload),
        // A create can take longer than the default read budget. Raising it
        // avoids turning a slow-but-successful order into an uncertain one.
        signal: AbortSignal.timeout(45_000),
      },
      { retries: 0, auth },
    );
  } catch (error) {
    // A definite 4xx (except a timeout) means nothing was created.
    const certain =
      error instanceof ApiError &&
      error.status >= 400 &&
      error.status < 500 &&
      error.status !== 408;
    if (certain) throw error;

    // A network failure or 5xx can happen after the supplier has already
    // charged us and created the server, so look it up by the deterministic
    // label before reporting an uncertain outcome.
    const existing = await findServerByLabel(String(payload.label ?? ""), 15_000, auth);
    if (existing) {
      return { data: existing, servers: [existing], recovered: true };
    }
    if (error instanceof ApiError) {
      throw new ApiError(
        "Server creation returned a server error and no matching server appeared. Check the RDP Monster panel before retrying.",
        error.status,
        "create_uncertain",
        error.ref,
      );
    }
    throw new ApiError(
      "Server creation did not confirm and no matching server appeared. Check the RDP Monster panel before retrying.",
      0,
      "create_uncertain",
    );
  }
}

export async function getCredentials(
  id: string,
  auth?: SupplierAuth,
): Promise<{ user: string; password: string }> {
  const response = await api<{ data: { user: string; password: string } }>(
    `/servers/${encodeURIComponent(id)}/actions`,
    { method: "POST", body: JSON.stringify({ action: "credentials" }) },
    { auth },
  );
  return response.data;
}

export async function powerAction(
  id: string,
  action: PowerAction,
  auth?: SupplierAuth,
): Promise<void> {
  await api(
    `/servers/${encodeURIComponent(id)}/actions`,
    {
      method: "POST",
      body: JSON.stringify({ action }),
    },
    { auth },
  );
}

export async function deleteServer(id: string): Promise<void> {
  await api(`/servers/${encodeURIComponent(id)}`, { method: "DELETE" });
}
