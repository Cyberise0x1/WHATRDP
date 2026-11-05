import { cancelMissingOrder, refreshOrderState, SERVER_GONE_MESSAGE } from "./orders";
import { isPowerAction, POWER_ACTION_COOLDOWN_MS } from "./power-actions";
import { ApiError, isMissingServerError, powerAction } from "./rdpmonster";
import { claimPowerAction, finishPowerAction, getOrderByToken } from "./store";
import { raiseAlert } from "./alerts";
import type { Order } from "./storage/types";

export type PowerActionResult =
  | { ok: true; order: Order; power: string | null }
  | { ok: false; status: number; error: string; message: string; retryAfter?: number };

export async function performPowerAction(
  token: string,
  payload: unknown,
): Promise<PowerActionResult> {
  const order = await getOrderByToken(token);
  if (!order) {
    return { ok: false, status: 404, error: "not_found", message: "This order does not exist." };
  }
  if (order.status !== "ACTIVE" || !order.service_id) {
    return {
      ok: false,
      status: 409,
      error: "not_ready",
      message: "This server is not ready for power actions.",
    };
  }

  const action = (payload as { action?: unknown } | null)?.action;
  if (!isPowerAction(action)) {
    return {
      ok: false,
      status: 400,
      error: "invalid_action",
      message: "Unsupported power action.",
    };
  }

  const audit = await claimPowerAction(order.id, action, POWER_ACTION_COOLDOWN_MS);
  if (!audit) {
    return {
      ok: false,
      status: 429,
      error: "rate_limited",
      message: "Too many power requests. Try again shortly.",
      retryAfter: Math.ceil(POWER_ACTION_COOLDOWN_MS / 1000),
    };
  }

  const record = async (outcome: string) => {
    try {
      await finishPowerAction(audit.id, outcome);
    } catch {
      // The action outcome is already known; a failed audit write must not
      // change the customer response. The initial `requested` row remains.
    }
  };

  // Operator-only, WHATRDP-branded: carries the platform's status/code so the
  // next incident is self-explanatory. Never customer data.
  const alertFailure = (
    outcome: string,
    severity: "warning" | "critical",
    supplierStatus: number,
    supplierCode: string,
  ) =>
    raiseAlert({
      code: "power_action_failed",
      severity,
      message: "A WHATRDP server power action failed",
      context: { orderId: order.id, action, outcome, supplierStatus, supplierCode },
    });

  try {
    await powerAction(order.service_id, action);
  } catch (error) {
    if (isMissingServerError(error)) {
      await cancelMissingOrder(order.id);
      await record("server_missing");
      alertFailure("server_missing", "warning", 404, "not_found");
      return {
        ok: false,
        status: 409,
        error: "server_missing",
        message: SERVER_GONE_MESSAGE,
      };
    }
    if (error instanceof ApiError && error.status === 409) {
      await record("rejected");
      alertFailure("rejected", "warning", 409, error.code || "unknown");
      return {
        ok: false,
        status: 409,
        error: "action_unavailable",
        message: "The server is not ready for that action right now.",
      };
    }
    if (error instanceof ApiError && error.status === 429) {
      await record("rate_limited");
      alertFailure("rate_limited", "warning", 429, error.code || "unknown");
      return {
        ok: false,
        status: 429,
        error: "rate_limited",
        message: "Too many power requests. Try again shortly.",
        retryAfter: 60,
      };
    }
    await record("failed");
    alertFailure(
      "failed",
      "critical",
      error instanceof ApiError ? error.status : 0,
      error instanceof ApiError ? error.code || "unknown" : "unreachable",
    );
    return {
      ok: false,
      status: 502,
      error: "action_failed",
      message: "The power action could not be completed. Try again shortly.",
    };
  }

  await record("sent");
  try {
    const state = await refreshOrderState(order, true, { recordError: false });
    return { ok: true, order: state.order, power: state.power };
  } catch {
    // The supplier accepted the action; a failed state read must not turn a
    // successful request into a retryable error.
    return { ok: true, order, power: order.power_state };
  }
}
