import { SeatHoldError } from "./errors";

/** A seat's claim state, as far as the hold rules care. */
export interface SeatClaimState {
  seatId: string;
  status: string;
  heldByUserId: string | null;
}

/** De-duplicate a seat selection. An empty selection is rejected. */
export function normalizeSeatSelection(seatIds: string[]): string[] {
  const unique = [...new Set(seatIds)];
  if (unique.length === 0) {
    throw new SeatHoldError("Select at least one seat.", "NOT_FOUND");
  }
  return unique;
}

/** When a hold placed at `now` stops protecting its seats. */
export function holdExpiry(now: Date, holdMinutes: number): Date {
  return new Date(now.getTime() + holdMinutes * 60_000);
}

/** A seat is claimable when it is open, or already held by the same user. */
export function isClaimableBy(seat: SeatClaimState, userId: string): boolean {
  return seat.status === "AVAILABLE" || (seat.status === "HELD" && seat.heldByUserId === userId);
}

/** The seats in `rows` this user cannot claim. */
export function unclaimableSeats<T extends SeatClaimState>(rows: T[], userId: string): T[] {
  return rows.filter((row) => !isClaimableBy(row, userId));
}
