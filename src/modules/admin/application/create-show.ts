import type { ShowFormat } from "@/modules/catalog/domain/show-format";
import { isSchedulable, seatPrice, type NewShowRequest } from "../domain/scheduling";
import type { ShowScheduler } from "./ports";

/**
 * Schedule a show and price its seat inventory from the hall's active seats.
 * Returns `false`, without writing, when the request is not schedulable.
 */
export class CreateShow {
  constructor(private readonly scheduler: ShowScheduler) {}

  async execute(request: NewShowRequest & { format: ShowFormat }): Promise<boolean> {
    if (!isSchedulable(request)) return false;
    const seats = await this.scheduler.activeSeats(request.hallId);
    await this.scheduler.createShow(
      request,
      seats.map((seat) => ({ seatId: seat.id, price: seatPrice(request.basePrice, seat.priceModifier) })),
    );
    return true;
  }
}
