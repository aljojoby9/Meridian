import type { PrismaClient } from "@prisma/client";
import type { BookingDetails, BookingQueries, UserBookingSummary } from "../application/read-models";

export class PrismaBookingQueries implements BookingQueries {
  constructor(private readonly db: PrismaClient) {}

  listForUser(userId: string): Promise<UserBookingSummary[]> {
    return this.db.booking.findMany({
      where: { userId },
      include: { show: { include: { movie: true, hall: { include: { cinema: true } } } }, tickets: true },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
  }

  findDetails(bookingId: string): Promise<BookingDetails | null> {
    return this.db.booking.findUnique({
      where: { id: bookingId },
      include: { show: { include: { movie: true, hall: { include: { cinema: true } } } }, tickets: true, showSeats: { include: { seat: true } } },
    });
  }
}
