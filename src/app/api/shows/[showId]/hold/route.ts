import { NextResponse } from "next/server";
import { getApiSession } from "@/server/guards";
import { container } from "@/server/container";
import { SeatHoldError, seatHoldErrorStatus } from "@/modules/seating/domain/errors";
import { holdSeatsSchema } from "@/modules/seating/schemas";
import { rateLimit } from "@/shared/server/rate-limit";
import { jsonError, readJson } from "@/shared/server/http";

export async function POST(req: Request, ctx: { params: Promise<{ showId: string }> }) {
  const session = await getApiSession();
  if (!session) return jsonError("Authentication required", 401);
  const { showId } = await ctx.params;

  const rl = rateLimit(`hold:${session.user.id}`, 20, 60_000);
  if (!rl.ok) return jsonError("Too many requests. Please slow down.", 429);

  const parsed = holdSeatsSchema.safeParse(await readJson(req));
  if (!parsed.success) return jsonError(parsed.error.flatten(), 400);

  try {
    const result = await container().seating.holdSeats.execute({ showId, userId: session.user.id, seatIds: parsed.data.seatIds });
    return NextResponse.json({ ok: true, ...result, expiresAt: result.expiresAt.toISOString() });
  } catch (e) {
    if (e instanceof SeatHoldError) {
      return NextResponse.json({ error: e.message, code: e.code, seatIds: e.seatIds }, { status: seatHoldErrorStatus(e.code) });
    }
    console.error(e);
    return jsonError("Failed to hold seats", 500);
  }
}
