import { CONFIRMED } from "../domain/booking";
import type { ConfirmPaidBooking } from "./confirm-paid-booking";
import type { PaymentConfigStatus, PaymentGateway } from "./ports";

export interface ReconcileInput {
  booking: { id: string; status: string; stripeCheckoutSessionId: string | null };
  checkoutSessionId: string;
}

/**
 * Safety net for the checkout success page: if the payment webhook has not
 * arrived yet (or was never configured), read the session back from the
 * provider and confirm a paid booking directly. Confirmation is idempotent,
 * so a webhook arriving at the same time is harmless.
 *
 * Returns true when this call confirmed the booking.
 */
export class ReconcilePaidCheckout {
  constructor(
    private readonly payments: PaymentGateway,
    private readonly confirmPaidBooking: ConfirmPaidBooking,
  ) {}

  async execute({ booking, checkoutSessionId }: ReconcileInput): Promise<boolean> {
    if (booking.status === CONFIRMED) return false;
    if (this.payments.status().mode !== "live") return false;

    const session = await this.payments.retrieveCheckoutSession(checkoutSessionId);
    const matches =
      (!!booking.stripeCheckoutSessionId && session.id === booking.stripeCheckoutSessionId) || session.bookingId === booking.id;
    if (!session.paid || !matches) return false;

    await this.confirmPaidBooking.execute({
      bookingId: booking.id,
      checkoutSessionId: session.id,
      paymentIntentId: session.paymentIntentId,
      rawEvent: session.raw,
    });
    return true;
  }
}

/** Which payment credentials are configured, for `GET /api/checkout`. Never returns key values. */
export class GetPaymentStatus {
  constructor(private readonly payments: PaymentGateway) {}

  execute(): PaymentConfigStatus {
    return this.payments.status();
  }
}
