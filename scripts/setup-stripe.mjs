#!/usr/bin/env node
/**
 * Interactive Stripe setup + verifier for Meridian.
 *
 *   npm run stripe:setup
 *
 * Prompts for the three Stripe values (or accepts `--secret`/`--publishable`/
 * `--webhook` as arguments), validates each locally, rewrites them into
 * `.env` in place, then polls the dev server's `GET /api/checkout` until the
 * app reports `mode: "live"` (max ~40s). Secrets are never printed back.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { EOL } from "node:os";
import readline from "node:readline/promises";

import { stripeValidationError } from "../src/modules/booking/infrastructure/stripe/stripe-config.ts";

const ENV_PATH = new URL("../.env", import.meta.url);
const APP_URL_DEFAULT = "http://localhost:3001";
const POLLS = 20;
const POLL_MS = 2000;

const parseArgs = (argv) => {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const m = argv[i].match(/^--([a-z-]+)$/i);
    if (!m) continue;
    // Value = next arg unless it looks like another flag (or there is none);
    // otherwise leave it undefined so the wizard prompts for it.
    if (i + 1 < argv.length && !argv[i + 1].startsWith("--")) out[m[1].toLowerCase()] = argv[++i];
  }
  return out;
};

/** Reads `name` from `.env` (single-line, quotes stripped). */
const readEnvVar = (name, fallback = "") => {
  if (!existsSync(ENV_PATH)) return fallback;
  const m = readFileSync(ENV_PATH, "utf8").match(new RegExp(`^[ \\t]*${name}=(.*)$`, "m"));
  return m ? m[1].trim().replace(/^["']|["']$/g, "") : fallback;
};

/** Replaces `name=value` in `.env`, or appends it at the end. */
const setEnvValue = (name, value) => {
  const file = existsSync(ENV_PATH) ? readFileSync(ENV_PATH, "utf8") : "";
  const re = new RegExp(`^[ \\t]*${name}=.*$`, "m");
  const entry = `${name}=${value}`;
  const out = re.test(file)
    ? file.replace(re, entry)
    : file.replace(/\s+$/, "")
      ? file.replace(/\s+$/, "") + EOL + entry + EOL
      : entry + EOL;
  writeFileSync(ENV_PATH, out);
};

const baseUrl = () => readEnvVar("NEXT_PUBLIC_APP_URL", APP_URL_DEFAULT) || APP_URL_DEFAULT;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function prompt(rl, label, kind) {
  for (;;) {
    const ans = (await rl.question(label)).trim();
    const err = stripeValidationError(kind, ans);
    if (!err) return ans;
    console.log(`  ✗ ${err}`);
  }
}

/** Polls GET /api/checkout until the app reports live, or gives up. */
async function verifyLive(base) {
  for (let i = 0; i < POLLS; i++) {
    if (i > 0) await sleep(POLL_MS);
    try {
      const res = await fetch(`${base}/api/checkout`);
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.mode === "live" && Array.isArray(data.missing) && data.missing.length === 0) return data;
    } catch {
      /* dev server not up yet */
    }
  }
  return null;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  const values = {
    STRIPE_SECRET_KEY: args.secret ?? (await prompt(rl, "Stripe secret key (sk_test_… / sk_live_…): ", "secret")),
    NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY:
      args.publishable ?? (await prompt(rl, "Stripe publishable key (pk_test_…): ", "publishable")),
    STRIPE_WEBHOOK_SECRET:
      args.webhook ?? (await prompt(rl, "Stripe webhook secret (whsec_…): ", "webhook")),
  };
  rl.close();

  for (const [name, value] of Object.entries(values)) setEnvValue(name, value);
  console.log("\n✓ Stripe values written to .env\n");

  const base = baseUrl();
  const data = await verifyLive(base);
  if (data) {
    console.log(`✓ GET ${base}/api/checkout -> ${JSON.stringify(data)}`);
    console.log("✓ Stripe Checkout is LIVE. Reload the page to try a payment.");
  } else {
    console.log("ℹ Could not reach the dev server (is it running?).");
    console.log("  Start it with `npm run dev`, then run `npm run stripe:status` to confirm.");
  }
}

main();
