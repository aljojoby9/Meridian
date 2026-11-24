import { NextResponse } from "next/server";
import { auth } from "@/server/auth";
import { container } from "@/server/container";
import { jsonError } from "@/shared/server/http";

export async function GET(_req: Request, ctx: { params: Promise<{ showId: string }> }) {
  const { showId } = await ctx.params;
  const session = await auth();

  const inventory = await container().seating.getShowInventory.execute(showId, session?.user?.id ?? null);
  if (!inventory) return jsonError("Show not found", 404);
  const { show, seats } = inventory;

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
