// Client-safe checkout flags. Kept apart from `checkout.ts` so the browser
// bundle never pulls in the server-only orchestration, which reaches the
// database driver.

// Master switch. It is deliberately not an environment toggle: a gateway must be
// implemented, configured and tested end to end before paid checkout goes live.
// Flipping this is the only application change required.
//
// Enabled 2026-10-30 (D-018) to take one verified staging payment. The separate
// production target guard was removed 2026-11-02 (D-032) after that order was
// verified end to end; this switch is now the only checkout gate. Production is
// not released automatically, so it reaches production only through the gated
// Deploy production workflow.
export const CHECKOUT_AVAILABLE = true;

export const CHECKOUT_UNAVAILABLE_MESSAGE =
  "Payments are not available yet. You can browse plans, but new orders are currently disabled.";
