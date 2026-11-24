import type { Clock } from "@/shared/kernel/ports";
import { holdExpiry, normalizeSeatSelection } from "../domain/hold-policy";
import type { HeldSeat, HoldTokenGenerator, SeatHoldRepository, ShowInventory, ShowInventoryReader } from "./ports";

export interface HoldSeatsResult {
  holdToken: string;
  expiresAt: Date;
  seatIds: string[];
}

/** Hold seats for a user. Throws `SeatHoldError` when a seat cannot be claimed. */
export class HoldSeats {
  constructor(
    private readonly holds: SeatHoldRepository,
    private readonly tokens: HoldTokenGenerator,
    private readonly clock: Clock,
    private readonly holdMinutes: () => number,
  ) {}

  async execute(input: { showId: string; userId: string; seatIds: string[] }): Promise<HoldSeatsResult> {
    const seatIds = normalizeSeatSelection(input.seatIds);
    const expiresAt = holdExpiry(this.clock.now(), this.holdMinutes());
    const holdToken = this.tokens.next();
    await this.holds.claim({ showId: input.showId, userId: input.userId, seatIds, holdToken, expiresAt });
    return { holdToken, expiresAt, seatIds };
  }
}

/** Release a user's hold on a show. */
export class ReleaseHold {
  constructor(private readonly holds: SeatHoldRepository) {}

  execute(input: { showId: string; userId: string; holdToken?: string; seatIds?: string[] }): Promise<void> {
    return this.holds.release(input);
  }
}

/** The show and its current seat inventory, after releasing expired holds. */
export class GetShowInventory {
  constructor(
    private readonly holds: SeatHoldRepository,
    private readonly reader: ShowInventoryReader,
  ) {}

  async execute(showId: string, viewerId: string | null): Promise<ShowInventory | null> {
    await this.holds.expireStaleHolds(showId);
    return this.reader.load(showId, viewerId);
  }
}

/** The seats a user still holds under a token, after releasing expired holds. */
export class GetActiveHold {
  constructor(private readonly holds: SeatHoldRepository) {}

  async execute(showId: string, userId: string, holdToken: string): Promise<HeldSeat[]> {
    await this.holds.expireStaleHolds(showId);
    return this.holds.findActiveHold(showId, userId, holdToken);
  }
}
