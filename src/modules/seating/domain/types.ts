export type SeatStatusView = "available" | "taken" | "recliner" | "selected" | "held";
export type SeatTypeValue = "STANDARD" | "RECLINER" | "PREMIUM" | "ACCESSIBLE";
export type ShowSeatStatusValue = "AVAILABLE" | "HELD" | "BOOKED" | "BLOCKED";

/** One seat of one show, as the browser sees it. */
export interface SeatViewModel {
  id: string;
  seatId: string;
  rowLabel: string;
  number: number;
  rowIndex: number;
  colIndex: number;
  type: SeatTypeValue;
  status: ShowSeatStatusValue;
  price: number; // cents
  x: number;
  y: number;
  z: number;
  holdExpiresAt: string | null;
  heldByCurrentUser: boolean;
}

/** Body of `POST /api/shows/:showId/hold`. */
export interface HoldResponse {
  ok: boolean;
  holdToken?: string;
  expiresAt?: string;
  seatIds?: string[];
  error?: string;
}
