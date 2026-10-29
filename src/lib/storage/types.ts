export type OrderStatus =
  | "PENDING_PAYMENT"
  | "PAID"
  | "PROVISIONING"
  | "ACTIVE"
  | "FAILED"
  | "CANCELLED"
  | "REVIEW_REQUIRED";

export interface Order {
  id: number;
  token: string;
  plan_sku: string;
  os: string;
  cycle: string;
  amount_cents: number;
  currency: string;
  status: OrderStatus;
  email: string | null;
  service_id: string | null;
  primary_ip: string | null;
  username: string | null;
  password_enc: string | null;
  error: string | null;
  payment_reference: string | null;
  created_at: string;
  updated_at: string;
}

export interface SqlStatement {
  bind(...values: (string | number | null)[]): SqlStatement;
  first<T>(): Promise<T | null>;
  all<T>(): Promise<{ results: T[] }>;
}

// Implemented by both a native D1 binding and the isolated Node/SQLite driver.
export interface SqlDatabase {
  prepare(sql: string): SqlStatement;
}
