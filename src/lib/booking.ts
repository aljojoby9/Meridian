import { prisma } from "./db";
import { getHeldSeatsForCheckout } from "./seat-lock";
import { BookingStatus, ShowSeatStatus, PaymentStatus } from "@prisma/client";
import QRCode from "qrcode";
import crypto from "crypto";

export interface PendingCheckoutBooking {
  id: string;
  totalAmount: number;
  currency: string;
  startsAt: Date;
  seats: Array<{ showSeatId: string; seatLabel: string; price: number }>;
  movieTitle: string;
  hallName: string;
  cinemaName: string;
}

/**
 * Creates a PENDING_PAYMENT booking from the caller's currently held seats.
 * The returned shape is explicit (no Prisma relation inference) so route
 * handlers stay type-safe and cheap to compile.
 */
export async function createPendingBooking(params: {
  showId: string;
  userId: string;
  holdToken: string;
}): Promise<PendingCheckoutBooking> {
  const { showId, userId, holdToken } = params;
  const held = await getHeldSeatsForCheckout(showId, userId, holdToken);
  if (!held.length) throw new Error("No active held seats found. Your hold may have expired.");

  const show = await prisma.show.findUnique({
    where: { id: showId },
    include: { movie: true, hall: { include: { cinema: true } } },
  });
  if (!show) throw new Error("Show not found.");

  const totalAmount = held.reduce((sum, s) => sum + s.price, 0);
  const expiresAt = held.reduce<Date | null>((min, s) => {
    if (!s.holdExpiresAt) return min;
    if (!min || s.holdExpiresAt < min) return s.holdExpiresAt;
    return min;
  }, null);

  const booking = await prisma.booking.create({
    data: {
      userId,
      showId,
      status: BookingStatus.PENDING_PAYMENT,
      totalAmount,
      currency: show.currency,
      expiresAt,
      showSeats: { connect: held.map((s) => ({ id: s.id })) },
    },
  });

  return {
    id: booking.id,
    totalAmount,
    currency: show.currency,
    startsAt: show.startsAt,
    seats: held.map((s) => ({
      showSeatId: s.id,
      seatLabel: `${s.seat.rowLabel}${s.seat.number}`,
      price: s.price,
    })),
    movieTitle: show.movie.title,
    hallName: show.hall.name,
    cinemaName: show.hall.cinema.name,
  };
}

export async function confirmBookingFromStripe(params: {
  bookingId: string;
  checkoutSessionId: string;
  paymentIntentId?: string | null;
  rawEvent?: unknown;
}) {
  const { bookingId, checkoutSessionId, paymentIntentId, rawEvent } = params;

  return prisma.$transaction(async (tx) => {
    const booking = await tx.booking.findUnique({
      where: { id: bookingId },
      include: { showSeats: { include: { seat: true } }, tickets: true, payment: true },
    });
    if (!booking) throw new Error("Booking not found");
    if (booking.status === BookingStatus.CONFIRMED) return booking; // idempotent

    // Seats must still be held for this booking before we convert them to BOOKED.
    const validSeats = booking.showSeats.filter(
      (s) => s.status === ShowSeatStatus.HELD || s.status === ShowSeatStatus.BOOKED,
    );
    if (validSeats.length !== booking.showSeats.length) {
      throw new Error("One or more seats are no longer held; booking cannot be confirmed safely.");
    }

    await tx.showSeat.updateMany({
      where: { bookingId: booking.id },
      data: { status: ShowSeatStatus.BOOKED, heldByUserId: null, holdExpiresAt: null, holdToken: null, version: { increment: 1 } },
    });

    await tx.booking.update({
      where: { id: booking.id },
      data: {
        status: BookingStatus.CONFIRMED,
        stripeCheckoutSessionId: checkoutSessionId,
        stripePaymentIntentId: paymentIntentId ?? null,
      },
    });

    await tx.payment.upsert({
      where: { bookingId: booking.id },
      update: {
        status: PaymentStatus.SUCCEEDED,
        stripeCheckoutSessionId: checkoutSessionId,
        stripePaymentIntentId: paymentIntentId ?? null,
        rawEvent: rawEvent as never,
      },
      create: {
        bookingId: booking.id,
        status: PaymentStatus.SUCCEEDED,
        amount: booking.totalAmount,
        currency: booking.currency,
        stripeCheckoutSessionId: checkoutSessionId,
        stripePaymentIntentId: paymentIntentId ?? null,
        rawEvent: rawEvent as never,
      },
    });

    if (booking.tickets.length === 0) {
      for (const ss of booking.showSeats) {
        const qrPayload = JSON.stringify({
          v: 1,
          bookingId: booking.id,
          code: booking.confirmationCode,
          showId: booking.showId,
          seat: `${ss.seat.rowLabel}${ss.seat.number}`,
          ticketId: crypto.randomUUID(),
        });
        await tx.ticket.create({
          data: {
            bookingId: booking.id,
            showSeatId: ss.id,
            seatLabel: `${ss.seat.rowLabel}${ss.seat.number}`,
            qrPayload,
          },
        });
      }
    }

    return tx.booking.findUniqueOrThrow({
      where: { id: booking.id },
      include: { tickets: true, showSeats: { include: { seat: true } } },
    });
  });
}

export async function ticketQrDataUrl(payload: string) {
  return QRCode.toDataURL(payload, { margin: 1, width: 220 });
}
