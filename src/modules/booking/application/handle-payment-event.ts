import type { PaymentEvent } from "../domain/payment-event";
import type { ConfirmPaidBooking } from "./confirm-paid-booking";

/**
 * Applies a verified payment event. A paid completed checkout confirms its
 * booking; everything else is ignored. Confirmation is idempotent, so provider
 * retries are safe.
 */
export class HandlePaymentEvent {
  constructor(private readonly confirmPaidBooking: ConfirmPaidBooking) {}

  async execute(event: PaymentEvent): Promise<void> {
    if (event.kind !== "checkout_completed") return;
    if (event.bookingId && event.paid) {
      await this.confirmPaidBooking.execute({
        bookingId: event.bookingId,
        checkoutSessionId: event.checkoutSessionId,
        paymentIntentId: event.paymentIntentId,
        rawEvent: event.raw,
      });
    }
  }
}
