import { Prisma, ShowSeatStatus, type PrismaClient } from "@prisma/client";
import { SeatHoldError } from "../domain/errors";
import { unclaimableSeats } from "../domain/hold-policy";
import type { HeldSeat, SeatClaim, SeatHoldRepository } from "../application/ports";

/** Field values that return a held seat to the open pool. */
function releasedSeat() {
  return {
    status: ShowSeatStatus.AVAILABLE,
    heldByUserId: null,
    holdExpiresAt: null,
    holdToken: null,
    version: { increment: 1 },
  } satisfies Prisma.ShowSeatUncheckedUpdateManyInput;
}

/** PostgreSQL seat holds. Claims use `SELECT … FOR UPDATE` row locks. */
export class PrismaSeatHoldRepository implements SeatHoldRepository {
  constructor(private readonly db: PrismaClient) {}

  async expireStaleHolds(showId?: string): Promise<void> {
    await this.db.showSeat.updateMany({
      where: {
        ...(showId ? { showId } : {}),
        status: ShowSeatStatus.HELD,
        holdExpiresAt: { lt: new Date() },
      },
      data: releasedSeat(),
    });
  }

  async claim({ showId, userId, seatIds, holdToken, expiresAt }: SeatClaim): Promise<void> {
    await this.db.$transaction(async (tx) => {
      // Lock the target seats and this user's other holds in one ordered pass.
      // The second transaction waits, then sees the committed status.
      await tx.$queryRaw`
        SELECT id
        FROM "ShowSeat"
        WHERE "showId" = ${showId}
          AND (
            "seatId" IN (${Prisma.join(seatIds)})
            OR ("heldByUserId" = ${userId} AND status = 'HELD')
          )
        ORDER BY "seatId" ASC
        FOR UPDATE
      `;

      await tx.showSeat.updateMany({
        where: {
          showId,
          seatId: { in: seatIds },
          status: ShowSeatStatus.HELD,
          holdExpiresAt: { lt: new Date() },
        },
        data: releasedSeat(),
      });

      const rows = await tx.showSeat.findMany({
        where: { showId, seatId: { in: seatIds } },
        select: { seatId: true, status: true, heldByUserId: true },
        orderBy: { seatId: "asc" },
      });

      if (rows.length !== seatIds.length) {
        throw new SeatHoldError("One or more seats do not exist for this show.", "NOT_FOUND");
      }

      const unavailable = unclaimableSeats(rows, userId);
      if (unavailable.length) {
        throw new SeatHoldError("Selected seats are no longer available.", "UNAVAILABLE", unavailable.map((r) => r.seatId));
      }

      await tx.showSeat.updateMany({
        where: {
          showId,
          heldByUserId: userId,
          status: ShowSeatStatus.HELD,
          seatId: { notIn: seatIds },
        },
        data: releasedSeat(),
      });

      // Atomic claim: only update seats still claimable by this user.
      const claimed = await tx.showSeat.updateMany({
        where: {
          showId,
          seatId: { in: seatIds },
          OR: [
            { status: ShowSeatStatus.AVAILABLE },
            { status: ShowSeatStatus.HELD, heldByUserId: userId },
          ],
        },
        data: {
          status: ShowSeatStatus.HELD,
          heldByUserId: userId,
          holdExpiresAt: expiresAt,
          holdToken,
          bookingId: null,
          version: { increment: 1 },
        },
      });

      if (claimed.count !== seatIds.length) {
        throw new SeatHoldError("Selected seats are no longer available.", "UNAVAILABLE");
      }
    });
  }

  async release({ showId, userId, holdToken, seatIds }: { showId: string; userId: string; holdToken?: string; seatIds?: string[] }): Promise<void> {
    await this.db.showSeat.updateMany({
      where: {
        showId,
        heldByUserId: userId,
        status: ShowSeatStatus.HELD,
        ...(holdToken ? { holdToken } : {}),
        ...(seatIds?.length ? { seatId: { in: seatIds } } : {}),
      },
      data: releasedSeat(),
    });
  }

  findActiveHold(showId: string, userId: string, holdToken: string): Promise<HeldSeat[]> {
    return this.db.showSeat.findMany({
      where: {
        showId,
        heldByUserId: userId,
        holdToken,
        status: ShowSeatStatus.HELD,
        holdExpiresAt: { gt: new Date() },
      },
      include: { seat: true },
    });
  }
}
