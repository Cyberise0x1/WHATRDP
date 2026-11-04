import { randomBytes } from "node:crypto";
import type { Order, SqlDatabase } from "./types";

type Patch = Partial<Omit<Order, "id" | "token" | "created_at">>;
const PATCH_KEYS = new Set([
  "plan_sku",
  "os",
  "cycle",
  "amount_cents",
  "status",
  "email",
  "service_id",
  "primary_ip",
  "username",
  "password_enc",
  "error",
  "payment_reference",
  "currency",
  "charge_currency",
  "charge_amount_minor",
  "fx_rate",
  "quote_expires_at",
]);

export class OrderRepository {
  constructor(private readonly db: SqlDatabase) {}

  async create(input: {
    planSku: string;
    os: string;
    cycle: string;
    amountCents: number;
    email?: string | null;
    chargeCurrency?: string;
    chargeAmountMinor?: number;
    fxRate?: string | null;
    quoteExpiresAt?: string | null;
  }): Promise<Order> {
    const now = new Date().toISOString();
    const row = await this.db
      .prepare(
        `INSERT INTO orders (token, plan_sku, os, cycle, amount_cents, status, email, charge_currency, charge_amount_minor, fx_rate, quote_expires_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'PENDING_PAYMENT', ?, ?, ?, ?, ?, ?, ?) RETURNING *`,
      )
      .bind(
        randomBytes(24).toString("base64url"),
        input.planSku,
        input.os,
        input.cycle,
        input.amountCents,
        input.email ?? null,
        input.chargeCurrency ?? "USD",
        input.chargeAmountMinor ?? input.amountCents,
        input.fxRate ?? null,
        input.quoteExpiresAt ?? null,
        now,
        now,
      )
      .first<Order>();
    if (!row) throw new Error("Order could not be persisted");
    return row;
  }

  byId(id: number) {
    return this.db.prepare("SELECT * FROM orders WHERE id = ?").bind(id).first<Order>();
  }

  byToken(token: string) {
    return this.db.prepare("SELECT * FROM orders WHERE token = ?").bind(token).first<Order>();
  }

  byService(id: string) {
    return this.db.prepare("SELECT * FROM orders WHERE service_id = ?").bind(id).first<Order>();
  }

  byPaymentReference(id: string) {
    return this.db
      .prepare("SELECT * FROM orders WHERE payment_reference = ?")
      .bind(id)
      .first<Order>();
  }

  hasWebhookEvent(svixId: string) {
    if (!svixId) return Promise.resolve(false);
    return this.db
      .prepare("SELECT svix_id FROM webhook_events WHERE svix_id = ?")
      .bind(svixId)
      .first<{ svix_id: string }>()
      .then((row) => Boolean(row));
  }

  async recordWebhookEvent(svixId: string, type: string) {
    if (!svixId) return;
    await this.db
      .prepare(
        "INSERT OR IGNORE INTO webhook_events (svix_id, type, created_at) VALUES (?, ?, ?) RETURNING svix_id",
      )
      .bind(svixId, type, new Date().toISOString())
      .first<{ svix_id: string }>();
  }

  async update(id: number, patch: Patch): Promise<Order> {
    const entries = Object.entries(patch).filter(([, value]) => value !== undefined);
    if (entries.some(([key]) => !PATCH_KEYS.has(key))) throw new Error("Unsupported order field");
    if (!entries.length) {
      const row = await this.byId(id);
      if (!row) throw new Error("Order not found");
      return row;
    }
    const row = await this.db
      .prepare(
        `UPDATE orders SET ${entries.map(([key]) => `${key} = ?`).join(", ")}, updated_at = ? WHERE id = ? RETURNING *`,
      )
      .bind(
        ...entries.map(([, value]) => value as string | number | null),
        new Date().toISOString(),
        id,
      )
      .first<Order>();
    if (!row) throw new Error("Order not found");
    return row;
  }

  // One database write claims a verified payment. Duplicate webhooks cannot win twice.
  // Compares the CHARGED amount/currency; COALESCE keeps legacy rows (which only
  // have amount_cents/currency) working until they are backfilled.
  claimPayment(id: number, reference: string, amount: number, currency = "USD") {
    return this.db
      .prepare(
        `UPDATE orders SET status = 'PAID', error = NULL, updated_at = ?
       WHERE id = ? AND payment_reference = ? AND COALESCE(charge_amount_minor, amount_cents) = ? AND COALESCE(charge_currency, currency) = ? AND status = 'PENDING_PAYMENT' RETURNING *`,
      )
      .bind(new Date().toISOString(), id, reference, amount, currency)
      .first<Order>();
  }

  // Persist intent BEFORE the billable API call. An interrupted claim never auto-creates again.
  claimProvision(id: number) {
    return this.db
      .prepare(
        `UPDATE orders SET status = 'PROVISIONING', error = 'Creation started; awaiting confirmation', updated_at = ?
       WHERE id = ? AND status = 'PAID' AND service_id IS NULL RETURNING *`,
      )
      .bind(new Date().toISOString(), id)
      .first<Order>();
  }

  // Credentials are written once. The CAS makes every concurrent writer safe;
  // only the winner may notify the customer.
  claimCredentials(id: number, username: string, passwordEnc: string) {
    return this.db
      .prepare(
        `UPDATE orders SET username = ?, password_enc = ?, updated_at = ?
       WHERE id = ? AND password_enc IS NULL AND status = 'ACTIVE' RETURNING *`,
      )
      .bind(username, passwordEnc, new Date().toISOString(), id)
      .first<Order>();
  }

  // One send attempt per claim, spaced by the caller. Attempts are bounded so a
  // persistent failure cannot notify forever.
  claimCredentialEmail(id: number, retryAfter: string, maxAttempts = 3) {
    const now = new Date().toISOString();
    return this.db
      .prepare(
        `UPDATE orders
       SET credentials_email_attempts = credentials_email_attempts + 1,
           credentials_email_last_attempt_at = ?,
           updated_at = ?
       WHERE id = ? AND status = 'ACTIVE' AND credentials_emailed_at IS NULL
         AND email IS NOT NULL AND password_enc IS NOT NULL
         AND credentials_email_attempts < ?
         AND (credentials_email_last_attempt_at IS NULL OR credentials_email_last_attempt_at < ?)
       RETURNING *`,
      )
      .bind(now, now, id, maxAttempts, retryAfter)
      .first<Order>();
  }

  markCredentialEmailSent(id: number) {
    const now = new Date().toISOString();
    return this.db
      .prepare(
        `UPDATE orders SET credentials_emailed_at = ?, updated_at = ?
       WHERE id = ? AND credentials_emailed_at IS NULL RETURNING *`,
      )
      .bind(now, now, id)
      .first<Order>();
  }

  async pendingCredentialEmails(cutoff: string, limit = 5, maxAttempts = 3) {
    return (
      await this.db
        .prepare(
          `SELECT * FROM orders
         WHERE status = 'ACTIVE' AND credentials_emailed_at IS NULL
           AND email IS NOT NULL AND password_enc IS NOT NULL
           AND credentials_email_attempts < ?
           AND (credentials_email_last_attempt_at IS NULL OR credentials_email_last_attempt_at < ?)
         ORDER BY updated_at ASC LIMIT ?`,
        )
        .bind(maxAttempts, cutoff, limit)
        .all<Order>()
    ).results;
  }

  // Bounded reconciliation query: only settled work that has not moved recently.
  async stale(cutoff: string, limit = 25) {
    return (
      await this.db
        .prepare(
          "SELECT * FROM orders WHERE status IN ('PAID','PROVISIONING') AND updated_at < ? ORDER BY updated_at ASC LIMIT ?",
        )
        .bind(cutoff, limit)
        .all<Order>()
    ).results;
  }

  async recent(limit = 50) {
    return (
      await this.db
        .prepare("SELECT * FROM orders ORDER BY id DESC LIMIT ?")
        .bind(limit)
        .all<Order>()
    ).results;
  }
}
