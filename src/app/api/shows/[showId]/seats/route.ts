import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { expireStaleHolds } from "@/lib/seat-lock";

export async function GET(_req: Request, ctx: { params: Promise<{ showId: string }> }) {
  const { showId } = await ctx.params;
  const session = await auth();
  const userId = session?.user?.id ?? null;

  await expireStaleHolds(showId);

  const show = await prisma.show.findUnique({
    where: { id: showId },
    include: {
      movie: true,
      hall: { include: { cinema: true } },
      showSeats: { include: { seat: true }, orderBy: [{ seat: { rowIndex: "asc" } }, { seat: { colIndex: "asc" } }] },
    },
  });
  if (!show) return NextResponse.json({ error: "Show not found" }, { status: 404 });

  const seats = show.showSeats.map((ss) => ({
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
    heldByCurrentUser: !!userId && ss.heldByUserId === userId,
  }));

  return NextResponse.json({
    show: {
      id: show.id,
      startsAt: show.startsAt.toISOString(),
      format: show.format,
      basePrice: show.basePrice,
      currency: show.currency,
      movie: show.movie,
      hall: show.hall,
      cinema: show.hall.cinema,
    },
    seats,
  });
}
