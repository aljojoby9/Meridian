import { prisma } from "./db";
import crypto from "crypto";
import { Prisma, ShowSeatStatus } from "@prisma/client";

const HOLD_MINUTES = Number(process.env.SEAT_HOLD_MINUTES ?? 10);

export class SeatHoldError extends Error {
  constructor(
    message: string,
    public code: "UNAVAILABLE" | "NOT_FOUND" | "UNAUTHORIZED" | "CONFLICT",
    public seatIds?: string[],
  ) {
    super(message);
  }
}

function holdToken() {
  return `hold_${crypto.randomBytes(24).toString("base64url")}`;
}

export async function expireStaleHolds(showId?: string) {
  await prisma.showSeat.updateMany({
    where: {
      ...(showId ? { showId } : {}),
      status: ShowSeatStatus.HELD,
      holdExpiresAt: { lt: new Date() },
    },
    data: {
      status: ShowSeatStatus.AVAILABLE,
      heldByUserId: null,
      holdExpiresAt: null,
      holdToken: null,
      version: { increment: 1 },
    },
  });
}

export async function holdSeats(params: { showId: string; userId: string; seatIds: string[] }) {
  const { showId, userId, seatIds } = params;
  const uniqueSeatIds = [...new Set(seatIds)];
  if (uniqueSeatIds.length === 0) {
    throw new SeatHoldError("Select at least one seat.", "NOT_FOUND");
  }
  const expiresAt = new Date(Date.now() + HOLD_MINUTES * 60_000);
  const token = holdToken();

  return prisma.$transaction(async (tx) => {
    // Lock the target seats and this user's other holds in one ordered pass.
    // The second transaction waits, then sees the committed status.
    await tx.$queryRaw`
      SELECT id
      FROM "ShowSeat"
      WHERE "showId" = ${showId}
        AND (
          "seatId" IN (${Prisma.join(uniqueSeatIds)})
          OR ("heldByUserId" = ${userId} AND status = 'HELD')
        )
      ORDER BY "seatId" ASC
      FOR UPDATE
    `;

    await tx.showSeat.updateMany({
      where: {
        showId,
        seatId: { in: uniqueSeatIds },
        status: ShowSeatStatus.HELD,
        holdExpiresAt: { lt: new Date() },
      },
      data: {
        status: ShowSeatStatus.AVAILABLE,
        heldByUserId: null,
        holdExpiresAt: null,
        holdToken: null,
        version: { increment: 1 },
      },
    });

    const rows = await tx.showSeat.findMany({
      where: { showId, seatId: { in: uniqueSeatIds } },
      select: { seatId: true, status: true, heldByUserId: true },
      orderBy: { seatId: "asc" },
    });

    if (rows.length !== uniqueSeatIds.length) {
      throw new SeatHoldError("One or more seats do not exist for this show.", "NOT_FOUND");
    }

    const unavailable = rows.filter(
      (r) => !(r.status === ShowSeatStatus.AVAILABLE || (r.status === ShowSeatStatus.HELD && r.heldByUserId === userId)),
    );
    if (unavailable.length) {
      throw new SeatHoldError("Selected seats are no longer available.", "UNAVAILABLE", unavailable.map((r) => r.seatId));
    }

    await tx.showSeat.updateMany({
      where: {
        showId,
        heldByUserId: userId,
        status: ShowSeatStatus.HELD,
        seatId: { notIn: uniqueSeatIds },
      },
      data: {
        status: ShowSeatStatus.AVAILABLE,
        heldByUserId: null,
        holdExpiresAt: null,
        holdToken: null,
        version: { increment: 1 },
      },
    });

    // Atomic claim: only update seats still claimable by this user.
    const claimed = await tx.showSeat.updateMany({
      where: {
        showId,
        seatId: { in: uniqueSeatIds },
        OR: [
          { status: ShowSeatStatus.AVAILABLE },
          { status: ShowSeatStatus.HELD, heldByUserId: userId },
        ],
      },
      data: {
        status: ShowSeatStatus.HELD,
        heldByUserId: userId,
        holdExpiresAt: expiresAt,
        holdToken: token,
        bookingId: null,
        version: { increment: 1 },
      },
    });

    if (claimed.count !== uniqueSeatIds.length) {
      throw new SeatHoldError("Selected seats are no longer available.", "UNAVAILABLE");
    }

    return { holdToken: token, expiresAt, seatIds: uniqueSeatIds };
  });
}

export async function releaseHold(params: { showId: string; userId: string; holdToken?: string; seatIds?: string[] }) {
  const { showId, userId, holdToken: token, seatIds } = params;
  await prisma.showSeat.updateMany({
    where: {
      showId,
      heldByUserId: userId,
      status: ShowSeatStatus.HELD,
      ...(token ? { holdToken: token } : {}),
      ...(seatIds?.length ? { seatId: { in: seatIds } } : {}),
    },
    data: {
      status: ShowSeatStatus.AVAILABLE,
      heldByUserId: null,
      holdExpiresAt: null,
      holdToken: null,
      version: { increment: 1 },
    },
  });
}

export async function getHeldSeatsForCheckout(showId: string, userId: string, token: string) {
  await expireStaleHolds(showId);
  const seats = await prisma.showSeat.findMany({
    where: {
      showId,
      heldByUserId: userId,
      holdToken: token,
      status: ShowSeatStatus.HELD,
      holdExpiresAt: { gt: new Date() },
    },
    include: { seat: true },
  });
  return seats;
}
