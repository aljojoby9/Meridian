import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getStripeConfigStatus,
  isStripeConfigured,
  isStripePlaceholder,
  stripeValidationError,
} from "@/modules/booking/infrastructure/stripe/stripe-config";

const REAL = {
  secret: "sk_test_51ABCdefGHIjklMNOpqrSTUvwxYZ0123456789",
  publishable: "pk_test_51ABCdefGHIjklMNOpqrSTUvwxYZ0123456789",
  webhook: "whsec_abcdefghijklmnopqrstuvwxyz012345",
};

function setEnv(secret?: string, publishable?: string, webhook?: string) {
  vi.stubEnv("STRIPE_SECRET_KEY", secret);
  vi.stubEnv("NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY", publishable);
  vi.stubEnv("STRIPE_WEBHOOK_SECRET", webhook);
}

afterEach(() => vi.unstubAllEnvs());

describe("Stripe configuration", () => {
  it("stays in demo mode while every value is a placeholder", () => {
    setEnv("sk_test_...", "pk_test_...", "whsec_...");
    const status = getStripeConfigStatus();
    expect(status.mode).toBe("demo");
    expect(isStripeConfigured()).toBe(false);
    expect(status.missing).toEqual([
      "STRIPE_SECRET_KEY",
      "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY",
      "STRIPE_WEBHOOK_SECRET",
    ]);
  });

  it("goes live only when all three values are real", () => {
    setEnv(REAL.secret, REAL.publishable, REAL.webhook);
    const status = getStripeConfigStatus();
    expect(status.mode).toBe("live");
    expect(status.secretKey).toBe(true);
    expect(status.publishableKey).toBe(true);
    expect(status.webhookSecret).toBe(true);
    expect(status.missing).toEqual([]);
    expect(isStripeConfigured()).toBe(true);
  });

  it("stays in demo if the webhook secret is still a placeholder", () => {
    // The dangerous half-configuration: a real secret key would create paid
    // sessions whose webhook is rejected, stranding bookings with no tickets.
    setEnv(REAL.secret, REAL.publishable, "whsec_...");
    expect(isStripeConfigured()).toBe(false);
    expect(getStripeConfigStatus().missing).toEqual(["STRIPE_WEBHOOK_SECRET"]);
  });

  it("names each missing variable without leaking any value", () => {
    setEnv(undefined, REAL.publishable, undefined);
    const status = getStripeConfigStatus();
    expect(status.missing).toEqual(["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET"]);
    expect(JSON.stringify(status)).not.toContain(REAL.publishable);
  });

  it("recognises short and dummy values as placeholders", () => {
    expect(isStripePlaceholder(undefined)).toBe(true);
    expect(isStripePlaceholder("   ")).toBe(true);
    expect(isStripePlaceholder("sk_test_x")).toBe(true);
    expect(isStripePlaceholder("replace-with-your-key")).toBe(true);
    expect(isStripePlaceholder(REAL.secret)).toBe(false);
    expect(isStripePlaceholder(REAL.webhook)).toBe(false);
  });
});

describe("stripeValidationError", () => {
  it("accepts realistic keys of each kind", () => {
    expect(stripeValidationError("secret", REAL.secret)).toBeNull();
    expect(stripeValidationError("secret", "sk_live_4eC39HqLyjWDarjtT1zdp7dc")).toBeNull();
    expect(stripeValidationError("publishable", REAL.publishable)).toBeNull();
    expect(stripeValidationError("webhook", REAL.webhook)).toBeNull();
  });

  it("rejects placeholders, dummies, and malformed values", () => {
    const err = stripeValidationError("secret", "sk_test_...");
    expect(err).not.toBeNull();
    expect(err).toContain("placeholder");
    expect(stripeValidationError("publishable", "pk_test_51x")).not.toBeNull(); // too short
    expect(stripeValidationError("webhook", "whsec_abc")).not.toBeNull(); // too short
    expect(stripeValidationError("webhook", "")).not.toBeNull();
    expect(stripeValidationError("secret", "my-super-secret-key-12345")).not.toBeNull(); // not sk_/rk_ shape
  });

  it("returns messages that never contain the value itself", () => {
    const err = stripeValidationError("secret", "sk_test_...");
    expect(err).not.toContain("sk_test_...");
  });
});

describe("isStripePlaceholder (any kind)", () => {
  it("detects placeholders and missing values", () => {
    expect(isStripePlaceholder(undefined)).toBe(true);
    expect(isStripePlaceholder("sk_test_abc")).toBe(true); // real keys are long
    expect(isStripePlaceholder("whsec_abc")).toBe(true); // too short
    expect(isStripePlaceholder("whsec_abc123def456ghi789")).toBe(false); // valid webhook shape
    expect(isStripePlaceholder(REAL.secret)).toBe(false);
  });
});
