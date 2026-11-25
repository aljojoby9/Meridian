/** Booking rules that do not depend on storage or payment providers. */

export interface PricedSeat {
  price: number;
  holdExpiresAt: Date | null;
}

/** Sum of seat prices, in cents. */
export function totalPrice(seats: PricedSeat[]): number {
  return seats.reduce((sum, s) => sum + s.price, 0);
}

/** The booking expires with the first of its seat holds. */
export function earliestHoldExpiry(seats: PricedSeat[]): Date | null {
  return seats.reduce<Date | null>((min, s) => {
    if (!s.holdExpiresAt) return min;
    if (!min || s.holdExpiresAt < min) return s.holdExpiresAt;
    return min;
  }, null);
}

/**
 * A booking can be confirmed only while every seat is still held (or already
 * booked). A booking that no longer owns any seat (for example because a later
 * checkout re-attached them) must not be confirmed as an empty, paid booking.
 */
export function canConfirmSeats(seatStatuses: string[]): boolean {
  return seatStatuses.length > 0 && seatStatuses.every((status) => status === "HELD" || status === "BOOKED");
}

export const CONFIRMED = "CONFIRMED";

/** Minutes a Stripe Checkout Session stays open. */
export const CHECKOUT_SESSION_MINUTES = 31;
