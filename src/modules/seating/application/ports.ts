import type { SeatViewModel } from "../domain/types";

/** A request to hold `seatIds` for `userId` until `expiresAt`. */
export interface SeatClaim {
  showId: string;
  userId: string;
  seatIds: string[];
  holdToken: string;
  expiresAt: Date;
}

/** One seat in a user's active hold. */
export interface HeldSeat {
  id: string;
  price: number;
  holdExpiresAt: Date | null;
  seat: { rowLabel: string; number: number };
}

/** Seat inventory writes. Implementations must make `claim` atomic. */
export interface SeatHoldRepository {
  /** Return every expired hold to the open pool, optionally for one show only. */
  expireStaleHolds(showId?: string): Promise<void>;
  /**
   * Claim the seats in one transaction: lock the rows, expire stale holds on
   * them, reject seats this user cannot claim (`SeatHoldError`), release the
   * user's other holds on the show, then mark the seats HELD.
   */
  claim(claim: SeatClaim): Promise<void>;
  /** Release this user's held seats on a show, narrowed by token and/or seat ids. */
  release(params: { showId: string; userId: string; holdToken?: string; seatIds?: string[] }): Promise<void>;
  /** Seats still held by this user under this token. */
  findActiveHold(showId: string, userId: string, holdToken: string): Promise<HeldSeat[]>;
}

export interface HoldTokenGenerator {
  next(): string;
}

/** Show details returned with the inventory. */
export interface InventoryShow {
  id: string;
  startsAt: Date;
  format: string;
  basePrice: number;
  currency: string;
  movie: { id: string; title: string; posterUrl: string | null; durationMin: number; rating: string | null; trailerUrl: string | null };
  hall: {
    id: string;
    name: string;
    cinemaId: string;
    screenWidthM: number;
    screenHeightM: number;
    hallDepthM: number;
    hallWidthM: number;
    cinema: { id: string; name: string; city: string; slug: string };
  };
}

export interface ShowInventory {
  show: InventoryShow;
  seats: SeatViewModel[];
}

/** Read model: a show with its seats projected for one viewer. */
export interface ShowInventoryReader {
  load(showId: string, viewerId: string | null): Promise<ShowInventory | null>;
}
