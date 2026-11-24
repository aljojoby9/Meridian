import { ShowSeatStatus, type PrismaClient } from "@prisma/client";
import type { ShowFormat } from "@/modules/catalog/domain/show-format";
import type { ShowScheduler } from "../application/ports";

export class PrismaShowScheduler implements ShowScheduler {
  constructor(private readonly db: PrismaClient) {}

  activeSeats(hallId: string): Promise<Array<{ id: string; priceModifier: number }>> {
    return this.db.seat.findMany({ where: { hallId, isActive: true } });
  }

  async createShow(
    show: { movieId: string; hallId: string; startsAt: Date; format: ShowFormat; basePrice: number },
    inventory: Array<{ seatId: string; price: number }>,
  ): Promise<void> {
    const { movieId, hallId, startsAt, format, basePrice } = show;
    await this.db.$transaction(async (tx) => {
      const created = await tx.show.create({ data: { movieId, hallId, startsAt, format, basePrice } });
      await tx.showSeat.createMany({
        data: inventory.map((line) => ({ showId: created.id, seatId: line.seatId, status: ShowSeatStatus.AVAILABLE, price: line.price })),
      });
    });
  }
}
