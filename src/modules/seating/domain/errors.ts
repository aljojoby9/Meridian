export type SeatHoldErrorCode = "UNAVAILABLE" | "NOT_FOUND" | "UNAUTHORIZED" | "CONFLICT";

export class SeatHoldError extends Error {
  constructor(
    message: string,
    public code: SeatHoldErrorCode,
    public seatIds?: string[],
  ) {
    super(message);
  }
}

/** HTTP status for a hold failure. */
export function seatHoldErrorStatus(code: SeatHoldErrorCode): number {
  return code === "UNAVAILABLE" ? 409 : code === "NOT_FOUND" ? 404 : 400;
}
