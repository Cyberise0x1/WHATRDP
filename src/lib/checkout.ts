// Deliberately not an environment toggle: a verified gateway must be implemented
// and tested before paid checkout can be enabled.
export const CHECKOUT_AVAILABLE = false;
export const CHECKOUT_UNAVAILABLE_MESSAGE =
  "Payments are not available yet. You can browse plans, but new orders are currently disabled.";
