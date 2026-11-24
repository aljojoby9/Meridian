/**
 * Stripe key validation and configuration status.
 *
 * All three values must be real before checkout switches from local demo mode
 * to a real Stripe Checkout Session. Requiring the webhook secret too is the
 * important part: with only a secret key, a customer could pay and the
 * `checkout.session.completed` event would be rejected, leaving the booking
 * PENDING_PAYMENT forever with no tickets. Demo mode until fully configured
 * means adding keys one at a time can never break checkout.
 *
 * Dependency-free on purpose: `scripts/setup-stripe.mjs` and
 * `scripts/stripe-status.mjs` import this file directly with tsx.
 */

export type StripeKeyKind = "secret" | "publishable" | "webhook";

export interface StripeKeys {
  secretKey?: string | null;
  publishableKey?: string | null;
  webhookSecret?: string | null;
}

export interface StripeConfigStatus {
  mode: "demo" | "live";
  secretKey: boolean;
  publishableKey: boolean;
  webhookSecret: boolean;
  /** Env var names still holding placeholders (safe to expose; never the values). */
  missing: string[];
}

const PLACEHOLDER_RE = /placeholder|replace|your[_-]?key|\.\.\./i;

const KEY_PATTERNS: Record<StripeKeyKind, RegExp> = {
  secret: /^(sk|rk)_(test|live)_[A-Za-z0-9]{4,}$/,
  publishable: /^pk_(test|live)_[A-Za-z0-9]{6,}$/,
  webhook: /^whsec_[A-Za-z0-9+/=_-]{6,}$/,
};

/**
 * Returns a human-readable reason when `value` is not a plausible Stripe key
 * of this kind, or null when it looks real. The message never contains the
 * value itself.
 */
export function stripeValidationError(kind: StripeKeyKind, value?: string | null): string | null {
  const v = value?.trim();
  if (!v) return "A value is required.";
  if (PLACEHOLDER_RE.test(v)) {
    return "That looks like a placeholder — paste the real key from the Stripe dashboard.";
  }
  if (!KEY_PATTERNS[kind].test(v)) {
    switch (kind) {
      case "secret":
        return "Secret keys look like `sk_test_…` or `rk_live_…`.";
      case "publishable":
        return "Publishable keys look like `pk_test_…`.";
      case "webhook":
        return "Webhook secrets look like `whsec_…` (the signing secret from `stripe listen`).";
    }
  }
  return null;
}

/** True when the value is not a plausible key of any Stripe kind. */
export function isStripePlaceholder(value?: string | null): boolean {
  const v = value?.trim();
  if (!v || PLACEHOLDER_RE.test(v)) return true;
  return !Object.values(KEY_PATTERNS).some((re) => re.test(v));
}

/** The three Stripe values from the process environment (used by scripts and as the default). */
export function stripeKeysFromEnv(env: Record<string, string | undefined> = process.env): StripeKeys {
  return {
    secretKey: env.STRIPE_SECRET_KEY,
    publishableKey: env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY,
    webhookSecret: env.STRIPE_WEBHOOK_SECRET,
  };
}

export function getStripeConfigStatus(keys: StripeKeys = stripeKeysFromEnv()): StripeConfigStatus {
  const secretKey = stripeValidationError("secret", keys.secretKey) === null;
  const publishableKey = stripeValidationError("publishable", keys.publishableKey) === null;
  const webhookSecret = stripeValidationError("webhook", keys.webhookSecret) === null;

  const missing: string[] = [];
  if (!secretKey) missing.push("STRIPE_SECRET_KEY");
  if (!publishableKey) missing.push("NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY");
  if (!webhookSecret) missing.push("STRIPE_WEBHOOK_SECRET");

  return {
    mode: secretKey && publishableKey && webhookSecret ? "live" : "demo",
    secretKey,
    publishableKey,
    webhookSecret,
    missing,
  };
}

/** True only when every Stripe value is a real key. */
export function isStripeConfigured(keys: StripeKeys = stripeKeysFromEnv()): boolean {
  return getStripeConfigStatus(keys).mode === "live";
}
