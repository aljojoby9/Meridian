/** A verified payment-provider event, normalised so booking never sees provider types. */
export type PaymentEvent =
  | {
      kind: "checkout_completed";
      bookingId: string | null;
      checkoutSessionId: string;
      paymentIntentId: string | null | undefined;
      paid: boolean;
      /** The provider's original event, stored with the payment. */
      raw: unknown;
    }
  | { kind: "ignored"; type: string };
