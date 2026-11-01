import { decryptSecret } from "./crypto";
import { raiseAlert } from "./alerts";
import type { OrderRepository } from "./storage/repository";
import type { Order } from "./storage/types";

export interface EmailMessage {
  from: string;
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export interface EmailBinding {
  send(message: EmailMessage): Promise<unknown>;
}

export interface EmailEnv {
  EMAIL?: EmailBinding;
  EMAIL_FROM?: string;
  PUBLIC_BASE_URL?: string;
  APP_SECRET: string;
}

export interface DeliveryDeps {
  send?: (message: EmailMessage) => Promise<unknown>;
  now?: () => Date;
  maxAttempts?: number;
  retryAfterMs?: number;
}

export type DeliveryOutcome = "sent" | "skipped" | "duplicate" | "failed";

const RETRY_AFTER_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 3;

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function renderCredentialsEmail(
  order: Order,
  password: string,
  publicBaseUrl?: string,
): Omit<EmailMessage, "from" | "to"> {
  const ip = order.primary_ip ?? "not reported yet";
  const username = order.username ?? "Administrator";
  const base = publicBaseUrl?.trim().replace(/\/+$/, "");
  const link = base ? `${base}/order/${encodeURIComponent(order.token)}` : null;

  const text = [
    "Hi,",
    "",
    "Your WHATRDP server is ready.",
    "",
    `Order: #${order.id}`,
    `Plan: ${order.plan_sku}`,
    `Operating system: ${order.os}`,
    `Term: ${order.cycle}`,
    "",
    `IP address: ${ip}`,
    `Username: ${username}`,
    `Password: ${password}`,
    ...(link ? ["", `Order page: ${link}`] : []),
    "",
    "Connect with Remote Desktop (mstsc) using the details above.",
    "Treat the order link as a password: anyone who has it can view these credentials.",
    "We can reset the password at any time on request.",
    "",
    "WHATRDP",
  ].join("\n");

  const html = [
    "<p>Hi,</p>",
    "<p>Your WHATRDP server is ready.</p>",
    "<ul>",
    `<li>Order: #${order.id}</li>`,
    `<li>Plan: ${escapeHtml(order.plan_sku)}</li>`,
    `<li>Operating system: ${escapeHtml(order.os)}</li>`,
    `<li>Term: ${escapeHtml(order.cycle)}</li>`,
    "</ul>",
    "<h2>Connection details</h2>",
    "<ul>",
    `<li>IP address: <code>${escapeHtml(ip)}</code></li>`,
    `<li>Username: <code>${escapeHtml(username)}</code></li>`,
    `<li>Password: <code>${escapeHtml(password)}</code></li>`,
    "</ul>",
    ...(link ? [`<p>Order page: <a href="${escapeHtml(link)}">${escapeHtml(link)}</a></p>`] : []),
    "<p>Connect with Remote Desktop (mstsc) using the details above.</p>",
    "<p>Treat the order link as a password: anyone who has it can view these credentials. " +
      "We can reset the password at any time on request.</p>",
    "<p>WHATRDP</p>",
  ].join("\n");

  return {
    subject: `Your WHATRDP server is ready (#${order.id})`,
    text,
    html,
  };
}

/**
 * Send the credentials email at most once per successful claim, with bounded
 * retries. Never throws: a notification failure must not fail fulfilment.
 */
export async function deliverCredentialsEmail(
  env: EmailEnv,
  repo: OrderRepository,
  order: Order,
  deps: DeliveryDeps = {},
): Promise<DeliveryOutcome> {
  let attempts = 0;
  try {
    if (!order.email) return "skipped";

    const from = env.EMAIL_FROM?.trim();
    if (!env.EMAIL || !from) {
      // Configuring this is deliberate; do not consume an attempt until it is.
      raiseAlert({
        code: "email_not_configured",
        severity: "critical",
        message: "A ready server has credentials but Email Service is not configured",
        context: { orderId: order.id },
        cooldownMs: 60 * 60 * 1000,
      });
      return "skipped";
    }
    if (!order.password_enc) return "skipped";

    const now = deps.now?.() ?? new Date();
    const retryAfter = new Date(
      now.getTime() - (deps.retryAfterMs ?? RETRY_AFTER_MS),
    ).toISOString();
    const maxAttempts = deps.maxAttempts ?? MAX_ATTEMPTS;
    const claimed = await repo.claimCredentialEmail(order.id, retryAfter, maxAttempts);
    if (!claimed) return "duplicate";
    attempts = claimed.credentials_email_attempts;

    const password = decryptSecret(claimed.password_enc as string, env.APP_SECRET);
    const message = renderCredentialsEmail(claimed, password, env.PUBLIC_BASE_URL);
    const send = deps.send ?? ((payload: EmailMessage) => env.EMAIL!.send(payload));
    await send({ from, to: claimed.email as string, ...message });

    await repo.markCredentialEmailSent(claimed.id);
    console.log(JSON.stringify({ event: "credentials_email_sent", orderId: claimed.id, attempts }));
    return "sent";
  } catch {
    const exhausted = attempts >= (deps.maxAttempts ?? MAX_ATTEMPTS);
    raiseAlert({
      code: exhausted ? "credentials_email_exhausted" : "credentials_email_failed",
      severity: exhausted ? "critical" : "warning",
      message: exhausted
        ? "Credentials email failed after all allowed attempts"
        : "Credentials email could not be sent",
      context: { orderId: order.id, attempts },
    });
    return "failed";
  }
}
