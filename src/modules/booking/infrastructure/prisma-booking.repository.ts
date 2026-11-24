import { BookingStatus, PaymentStatus, ShowSeatStatus, type Prisma, type PrismaClient } from "@prisma/client";
import type {
  BookingForConfirmation,
  BookingRepository,
  BookingUnitOfWork,
  CheckoutShow,
  ConfirmationStore,
  ShowLookup,
} from "../application/ports";

export class PrismaBookingRepository implements BookingRepository {
  constructor(private readonly db: PrismaClient) {}

  async createPending(input: {
    userId: string;
    showId: string;
    totalAmount: number;
    currency: string;
    expiresAt: Date | null;
    showSeatIds: string[];
  }): Promise<{ id: string }> {
    const booking = await this.db.booking.create({
      data: {
        userId: input.userId,
        showId: input.showId,
        status: BookingStatus.PENDING_PAYMENT,
        totalAmount: input.totalAmount,
        currency: input.currency,
        expiresAt: input.expiresAt,
        showSeats: { connect: input.showSeatIds.map((id) => ({ id })) },
      },
    });
    return { id: booking.id };
  }

  async attachCheckoutSession(bookingId: string, checkoutSessionId: string): Promise<void> {
    await this.db.booking.update({ where: { id: bookingId }, data: { stripeCheckoutSessionId: checkoutSessionId } });
  }
}

export class PrismaShowLookup implements ShowLookup {
  constructor(private readonly db: PrismaClient) {}

  async findForCheckout(showId: string): Promise<CheckoutShow | null> {
    const show = await this.db.show.findUnique({
      where: { id: showId },
      include: { movie: true, hall: { include: { cinema: true } } },
    });
    if (!show) return null;
    return {
      currency: show.currency,
      startsAt: show.startsAt,
      movieTitle: show.movie.title,
      hallName: show.hall.name,
      cinemaName: show.hall.cinema.name,
    };
  }
}

/** Confirmation writes bound to one interactive transaction. */
class PrismaConfirmationStore implements ConfirmationStore {
  constructor(private readonly tx: Prisma.TransactionClient) {}

  async findForConfirmation(bookingId: string): Promise<BookingForConfirmation | null> {
    const booking = await this.tx.booking.findUnique({
      where: { id: bookingId },
      include: { showSeats: { include: { seat: true } }, tickets: true, payment: true },
    });
    if (!booking) return null;
    return {
      id: booking.id,
      showId: booking.showId,
      status: booking.status,
      confirmationCode: booking.confirmationCode,
      totalAmount: booking.totalAmount,
      currency: booking.currency,
      ticketCount: booking.tickets.length,
      seats: booking.showSeats.map((ss) => ({
        showSeatId: ss.id,
        status: ss.status,
        rowLabel: ss.seat.rowLabel,
        number: ss.seat.number,
      })),
    };
  }

  async markSeatsBooked(bookingId: string): Promise<void> {
    await this.tx.showSeat.updateMany({
      where: { bookingId },
      data: { status: ShowSeatStatus.BOOKED, heldByUserId: null, holdExpiresAt: null, holdToken: null, version: { increment: 1 } },
    });
  }

  async markConfirmed(bookingId: string, payment: { checkoutSessionId: string; paymentIntentId: string | null }): Promise<void> {
    await this.tx.booking.update({
      where: { id: bookingId },
      data: {
        status: BookingStatus.CONFIRMED,
        stripeCheckoutSessionId: payment.checkoutSessionId,
        stripePaymentIntentId: payment.paymentIntentId,
      },
    });
  }

  async recordPayment(input: {
    bookingId: string;
    amount: number;
    currency: string;
    checkoutSessionId: string;
    paymentIntentId: string | null;
    rawEvent: unknown;
  }): Promise<void> {
    await this.tx.payment.upsert({
      where: { bookingId: input.bookingId },
      update: {
        status: PaymentStatus.SUCCEEDED,
        stripeCheckoutSessionId: input.checkoutSessionId,
        stripePaymentIntentId: input.paymentIntentId,
        rawEvent: input.rawEvent as never,
      },
      create: {
        bookingId: input.bookingId,
        status: PaymentStatus.SUCCEEDED,
        amount: input.amount,
        currency: input.currency,
        stripeCheckoutSessionId: input.checkoutSessionId,
        stripePaymentIntentId: input.paymentIntentId,
        rawEvent: input.rawEvent as never,
      },
    });
  }

  async issueTicket(input: { bookingId: string; showSeatId: string; seatLabel: string; qrPayload: string }): Promise<void> {
    await this.tx.ticket.create({ data: input });
  }
}

export class PrismaBookingUnitOfWork implements BookingUnitOfWork {
  constructor(private readonly db: PrismaClient) {}

  run<T>(work: (store: ConfirmationStore) => Promise<T>): Promise<T> {
    return this.db.$transaction((tx) => work(new PrismaConfirmationStore(tx)));
  }
}
