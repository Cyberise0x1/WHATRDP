import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { randomBytes } from "node:crypto";

export type OrderStatus =
  | "PENDING_PAYMENT"
  | "PAID"
  | "PROVISIONING"
  | "ACTIVE"
  | "FAILED"
  | "CANCELLED";

export interface Order {
  id: number;
  token: string;
  plan_sku: string;
  os: string;
  cycle: string;
  amount_cents: number;
  status: OrderStatus;
  email: string | null;
  service_id: string | null;
  primary_ip: string | null;
  username: string | null;
  password_enc: string | null;
  error: string | null;
  stripe_session: string | null;
  created_at: string;
  updated_at: string;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  token TEXT UNIQUE NOT NULL,
  plan_sku TEXT NOT NULL,
  os TEXT NOT NULL,
  cycle TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING_PAYMENT',
  email TEXT,
  service_id TEXT,
  primary_ip TEXT,
  username TEXT,
  password_enc TEXT,
  error TEXT,
  stripe_session TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_orders_service ON orders(service_id);
CREATE INDEX IF NOT EXISTS idx_orders_session ON orders(stripe_session);
`;

let database: DatabaseSync | null = null;

function db(): DatabaseSync {
  if (database) return database;
  const file = process.env.DATABASE_PATH ?? join(process.cwd(), "data", "storefront.db");
  mkdirSync(dirname(file), { recursive: true });
  const instance = new DatabaseSync(file);
  instance.exec("PRAGMA journal_mode = WAL;");
  instance.exec(SCHEMA);
  database = instance;
  return instance;
}

export function newToken(): string {
  return randomBytes(24).toString("base64url");
}

export function createOrder(input: {
  planSku: string;
  os: string;
  cycle: string;
  amountCents: number;
  email?: string | null;
}): Order {
  const now = new Date().toISOString();
  const token = newToken();
  const result = db()
    .prepare(
      `INSERT INTO orders (token, plan_sku, os, cycle, amount_cents, status, email, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'PENDING_PAYMENT', ?, ?, ?)`,
    )
    .run(token, input.planSku, input.os, input.cycle, input.amountCents, input.email ?? null, now, now);

  return getOrderById(Number(result.lastInsertRowid)) as Order;
}

export function getOrderById(id: number): Order | null {
  return (db().prepare("SELECT * FROM orders WHERE id = ?").get(id) as unknown as Order) ?? null;
}

export function getOrderByToken(token: string): Order | null {
  return (db().prepare("SELECT * FROM orders WHERE token = ?").get(token) as unknown as Order) ?? null;
}

export function getOrderByServiceId(serviceId: string): Order | null {
  return (db().prepare("SELECT * FROM orders WHERE service_id = ?").get(serviceId) as unknown as Order) ?? null;
}

export function getOrderByStripeSession(sessionId: string): Order | null {
  return (db().prepare("SELECT * FROM orders WHERE stripe_session = ?").get(sessionId) as unknown as Order) ?? null;
}

export function updateOrder(id: number, patch: Partial<Omit<Order, "id" | "token" | "created_at">>): Order {
  const entries = Object.entries(patch).filter(([, value]) => value !== undefined);
  if (entries.length === 0) {
    return getOrderById(id) as Order;
  }

  const assignments = entries.map(([key]) => `${key} = ?`).join(", ");
  const values = entries.map(([, value]) => value as string | number | null);

  db()
    .prepare(`UPDATE orders SET ${assignments}, updated_at = ? WHERE id = ?`)
    .run(...values, new Date().toISOString(), id);

  return getOrderById(id) as Order;
}

export function recentOrders(limit = 50): Order[] {
  return db().prepare("SELECT * FROM orders ORDER BY id DESC LIMIT ?").all(limit) as unknown as Order[];
}
