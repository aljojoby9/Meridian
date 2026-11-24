/** Query side of the booking module: shapes the pages render. */

export interface UserBookingSummary {
  id: string;
  status: string;
  totalAmount: number;
  currency: string;
  confirmationCode: string;
  show: { startsAt: Date; movie: { title: string }; hall: { cinema: { name: string } } };
  tickets: Array<{ seatLabel: string }>;
}

export interface BookingDetails {
  id: string;
  userId: string;
  status: string;
  confirmationCode: string;
  stripeCheckoutSessionId: string | null;
  show: { startsAt: Date; movie: { title: string }; hall: { name: string; cinema: { name: string } } };
  tickets: Array<{ id: string; seatLabel: string; qrPayload: string }>;
}

export interface BookingQueries {
  /** The 50 most recent bookings for a user, newest first. */
  listForUser(userId: string): Promise<UserBookingSummary[]>;
  /** A booking with its show and tickets, or `null`. Callers check ownership. */
  findDetails(bookingId: string): Promise<BookingDetails | null>;
}
