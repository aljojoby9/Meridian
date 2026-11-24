import type { Prisma, PrismaClient } from "@prisma/client";
import type { SeatViewModel } from "../domain/types";
import type { ShowInventory, ShowInventoryReader } from "../application/ports";

const showInventoryInclude = {
  movie: true,
  hall: { include: { cinema: true } },
  showSeats: { include: { seat: true }, orderBy: [{ seat: { rowIndex: "asc" } }, { seat: { colIndex: "asc" } }] },
} satisfies Prisma.ShowInclude;

type ShowSeatWithSeat = Prisma.ShowSeatGetPayload<{ include: { seat: true } }>;

export function toSeatViewModel(ss: ShowSeatWithSeat, viewerId: string | null): SeatViewModel {
  return {
    id: ss.id,
    seatId: ss.seatId,
    rowLabel: ss.seat.rowLabel,
    number: ss.seat.number,
    rowIndex: ss.seat.rowIndex,
    colIndex: ss.seat.colIndex,
    type: ss.seat.type,
    status: ss.status,
    price: ss.price,
    x: ss.seat.x,
    y: ss.seat.y,
    z: ss.seat.z,
    holdExpiresAt: ss.holdExpiresAt?.toISOString() ?? null,
    heldByCurrentUser: !!viewerId && ss.heldByUserId === viewerId,
  };
}

/** Loads a show, its movie, hall, cinema, and seats in screen order. */
export class PrismaShowInventoryReader implements ShowInventoryReader {
  constructor(private readonly db: PrismaClient) {}

  async load(showId: string, viewerId: string | null): Promise<ShowInventory | null> {
    const show = await this.db.show.findUnique({ where: { id: showId }, include: showInventoryInclude });
    if (!show) return null;
    return { show, seats: show.showSeats.map((ss) => toSeatViewModel(ss, viewerId)) };
  }
}
