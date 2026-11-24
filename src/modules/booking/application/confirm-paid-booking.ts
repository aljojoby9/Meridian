import type { IdGenerator } from "@/shared/kernel/ports";
import { seatLabel } from "@/shared/lib/format";
import { canConfirmSeats, CONFIRMED } from "../domain/booking";
import { BookingNotFoundError, SeatsNoLongerHeldError } from "../domain/errors";
import { buildTicketQrPayload } from "../domain/ticket";
import type { BookingUnitOfWork } from "./ports";

export interface ConfirmPaidBookingInput {
  bookingId: string;
  checkoutSessionId: string;
  paymentIntentId?: string | null;
  rawEvent?: unknown;
}

/**
 * Turns a paid booking into tickets, in one transaction: seats become BOOKED,
 * the booking is CONFIRMED, the payment is recorded, and one QR ticket is
 * issued per seat. Idempotent: an already confirmed booking is left as is.
 */
export class ConfirmPaidBooking {
  constructor(
    private readonly uow: BookingUnitOfWork,
    private readonly ids: IdGenerator,
  ) {}

  execute({ bookingId, checkoutSessionId, paymentIntentId, rawEvent }: ConfirmPaidBookingInput): Promise<void> {
    return this.uow.run(async (store) => {
      const booking = await store.findForConfirmation(bookingId);
      if (!booking) throw new BookingNotFoundError();
      if (booking.status === CONFIRMED) return;

      if (!canConfirmSeats(booking.seats.map((s) => s.status))) {
        throw new SeatsNoLongerHeldError();
      }

      const payment = { checkoutSessionId, paymentIntentId: paymentIntentId ?? null };
      await store.markSeatsBooked(booking.id);
      await store.markConfirmed(booking.id, payment);
      await store.recordPayment({
        bookingId: booking.id,
        amount: booking.totalAmount,
        currency: booking.currency,
        ...payment,
        rawEvent,
      });

      if (booking.ticketCount === 0) {
        for (const seat of booking.seats) {
          const label = seatLabel(seat.rowLabel, seat.number);
          await store.issueTicket({
            bookingId: booking.id,
            showSeatId: seat.showSeatId,
            seatLabel: label,
            qrPayload: buildTicketQrPayload({
              bookingId: booking.id,
              confirmationCode: booking.confirmationCode,
              showId: booking.showId,
              seatLabel: label,
              ticketId: this.ids.uuid(),
            }),
          });
        }
      }
    });
  }
}
