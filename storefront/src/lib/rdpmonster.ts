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

function baseUrl(): string {
  const raw = process.env.RDP_MONSTER_BASE_URL?.trim() || "https://dashboard.rdp.monster/api/v1";
  const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  return withScheme.replace(/\/$/, "").replace(/\/api\/v1$/, "") + "/api/v1";
}

function token(): string {
  const value = process.env.RDP_MONSTER_API_TOKEN?.trim();
  if (!value) {
    throw new ApiError("RDP_MONSTER_API_TOKEN is not configured", 0, "missing_token");
  }
  return value;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function api<T>(
  path: string,
  init: RequestInit = {},
  options: { retries?: number } = {},
): Promise<T> {
  const method = (init.method ?? "GET").toUpperCase();
  const retries = method === "GET" ? Math.min(3, Math.max(0, options.retries ?? 2)) : 0;
  let attempt = 0;

  while (true) {
    attempt += 1;
    const response = await fetch(`${baseUrl()}${path}`, {
      ...init,
      cache: "no-store",
      signal: init.signal ?? AbortSignal.timeout(10_000),
      headers: {
        Authorization: `Bearer ${token()}`,
        Accept: "application/json",
        "Content-Type": "application/json",
        "User-Agent": "rdpmonster-storefront/1.0",
        ...(init.headers ?? {}),
      },
    });

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

export async function getAccount(): Promise<Account> {
  const response = await api<{ data: Account }>("/account");
  return response.data;
}

export async function getServer(id: string): Promise<Server> {
  const response = await api<{ data: Server }>(`/servers/${encodeURIComponent(id)}`);
  return response.data;
}

export async function findServerByLabel(label: string, waitMs = 15_000): Promise<Server | null> {
  if (!label) return null;
  const deadline = Date.now() + Math.max(0, waitMs);

  do {
    const response = await api<{ data: Server[] }>("/servers?perPage=200&page=1");
    const match = response.data.find((server) => server.label === label);
    if (match) return match;
    if (Date.now() >= deadline) break;
    await sleep(3000);
  } while (true);

  return null;
}

export async function createServer(payload: Record<string, unknown>): Promise<{
  data: Server;
  servers?: Server[];
  invoice?: { id: string; totalCents: number } | null;
  recovered?: boolean;
}> {
  try {
    return await api("/servers", { method: "POST", body: JSON.stringify(payload) }, { retries: 0 });
  } catch (error) {
    if (!(error instanceof ApiError) || error.status < 500) {
      throw error;
    }
    const existing = await findServerByLabel(String(payload.label ?? ""));
    if (existing) {
      return { data: existing, servers: [existing], recovered: true };
    }
    throw new ApiError(
      "Server creation returned a server error and no matching server appeared. Check the RDP Monster panel before retrying.",
      error.status,
      "create_uncertain",
      error.ref,
    );
  }
}

export async function getCredentials(id: string): Promise<{ user: string; password: string }> {
  const response = await api<{ data: { user: string; password: string } }>(
    `/servers/${encodeURIComponent(id)}/actions`,
    { method: "POST", body: JSON.stringify({ action: "credentials" }) },
  );
  return response.data;
}

export async function powerAction(id: string, action: string): Promise<void> {
  await api(`/servers/${encodeURIComponent(id)}/actions`, {
    method: "POST",
    body: JSON.stringify({ action }),
  });
}

export async function deleteServer(id: string): Promise<void> {
  await api(`/servers/${encodeURIComponent(id)}`, { method: "DELETE" });
}
