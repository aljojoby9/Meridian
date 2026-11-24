/**
 * Server-side configuration. Every `process.env` read for app behaviour goes
 * through here so the rest of the code never touches the environment directly.
 */
export const serverEnv = {
  /** Minutes a seat stays HELD before it can be claimed by someone else. */
  seatHoldMinutes(): number {
    return Number(process.env.SEAT_HOLD_MINUTES ?? 10);
  },

  /** Public origin used to build Stripe redirect URLs. */
  appOrigin(): string {
    return process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  },

  stripeSecretKey(): string | undefined {
    return process.env.STRIPE_SECRET_KEY;
  },

  stripePublishableKey(): string | undefined {
    return process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
  },

  stripeWebhookSecret(): string | undefined {
    return process.env.STRIPE_WEBHOOK_SECRET;
  },

  isProduction(): boolean {
    return process.env.NODE_ENV === "production";
  },

  /** Production demos only: allow local demo confirmation without real Stripe keys. */
  allowDemoCheckout(): boolean {
    return process.env.ALLOW_DEMO_CHECKOUT === "true";
  },
};
