#!/usr/bin/env node
/**
 * Prints the current Stripe configuration: mode (DEMO/LIVE) and which
 * variables are still placeholders. Read-only — prints env var NAMES only,
 * never values.
 *
 *   npm run stripe:status
 */
import { getStripeConfigStatus } from "../src/modules/booking/infrastructure/stripe/stripe-config.ts";

// tsx does not read .env, so load it here (already-set variables win).
try {
  process.loadEnvFile(new URL("../.env", import.meta.url));
} catch {
  /* no .env file: report from the process environment only */
}

const s = getStripeConfigStatus();

console.log(`Mode: ${s.mode === "live" ? "LIVE (checkout uses real Stripe keys)" : "DEMO (placeholders or missing values)"}`);
console.log(`  STRIPE_SECRET_KEY:                  ${s.secretKey ? "ok" : "missing/placeholder"}`);
console.log(`  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: ${s.publishableKey ? "ok" : "missing/placeholder"}`);
console.log(`  STRIPE_WEBHOOK_SECRET:              ${s.webhookSecret ? "ok" : "missing/placeholder"}`);
console.log(s.missing.length ? `  Missing: ${s.missing.join(", ")}` : "  Missing: none");
