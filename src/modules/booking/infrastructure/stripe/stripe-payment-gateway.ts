import Stripe from "stripe";
import type { CheckoutSessionRequest, PaidSessionCheck, PaymentConfigStatus, PaymentGateway } from "../../application/ports";
import { getStripeConfigStatus, isStripePlaceholder, type StripeKeys } from "./stripe-config";

/** Builds a Stripe client. Refuses missing or placeholder secret keys. */
export function createStripeClient(secretKey: string | null | undefined): Stripe {
  const key = secretKey?.trim();
  if (!key || isStripePlaceholder(key)) {
    throw new Error("STRIPE_SECRET_KEY is not configured with a real Stripe key");
  }
  return new Stripe(key, { apiVersion: "2025-02-24.acacia" });
}

/** Stripe Checkout as the booking module's payment gateway. */
export class StripePaymentGateway implements PaymentGateway {
  constructor(private readonly keys: () => StripeKeys) {}

  /** Live only when the secret key, publishable key, and webhook secret are all real. */
  status(): PaymentConfigStatus {
    return getStripeConfigStatus(this.keys());
  }

  async createCheckoutSession(request: CheckoutSessionRequest): Promise<{ id: string; url: string | null }> {
    const session = await createStripeClient(this.keys().secretKey).checkout.sessions.create({
      mode: "payment",
      customer_email: request.customerEmail,
      line_items: request.lineItems.map((item) => ({
        quantity: 1,
        price_data: {
          currency: item.currency,
          unit_amount: item.unitAmount,
          product_data: {
            name: item.name,
            description: item.description,
          },
        },
      })),
      success_url: request.successUrl,
      cancel_url: request.cancelUrl,
      metadata: request.metadata,
      expires_at: request.expiresAt,
    });
    return { id: session.id, url: session.url };
  }

  async retrieveCheckoutSession(checkoutSessionId: string): Promise<PaidSessionCheck> {
    const session = await createStripeClient(this.keys().secretKey).checkout.sessions.retrieve(checkoutSessionId);
    return {
      id: session.id,
      paid: session.payment_status === "paid",
      bookingId: session.metadata?.bookingId ?? null,
      paymentIntentId: typeof session.payment_intent === "string" ? session.payment_intent : (session.payment_intent?.id ?? null),
      raw: session,
    };
  }
}
