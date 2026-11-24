import type Stripe from "stripe";
import { WebhookVerificationError } from "../../domain/errors";
import type { PaymentEvent } from "../../domain/payment-event";
import type { PaymentWebhookVerifier } from "../../application/ports";
import { createStripeClient } from "./stripe-payment-gateway";
import type { StripeKeys } from "./stripe-config";

/** Translate a Stripe event into the booking module's PaymentEvent. */
export function toPaymentEvent(event: Stripe.Event): PaymentEvent {
  if (event.type !== "checkout.session.completed") return { kind: "ignored", type: event.type };
  const session = event.data.object as Stripe.Checkout.Session;
  return {
    kind: "checkout_completed",
    bookingId: session.metadata?.bookingId ?? null,
    checkoutSessionId: session.id,
    paymentIntentId: typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id,
    paid: session.payment_status === "paid",
    raw: event,
  };
}

/** Verifies Stripe webhook signatures and normalises the payload. */
export class StripeWebhookVerifier implements PaymentWebhookVerifier {
  constructor(private readonly keys: () => StripeKeys) {}

  /**
   * Returns `null` when the signature header or the webhook secret is missing.
   * Throws `WebhookVerificationError` when the signature does not match.
   */
  verify(body: string, signature: string | null): PaymentEvent | null {
    const { secretKey, webhookSecret: secret } = this.keys();
    if (!signature || !secret) return null;
    let event: Stripe.Event;
    try {
      event = createStripeClient(secretKey).webhooks.constructEvent(body, signature, secret);
    } catch (err: unknown) {
      throw new WebhookVerificationError(String((err as { message?: string } | null)?.message));
    }
    return toPaymentEvent(event);
  }
}
