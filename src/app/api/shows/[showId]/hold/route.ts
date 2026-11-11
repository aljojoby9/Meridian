import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { holdSeats, SeatHoldError } from "@/lib/seat-lock";
import { holdSeatsSchema } from "@/lib/validations";
import { rateLimit } from "@/lib/rate-limit";

export async function POST(req: Request, ctx: { params: Promise<{ showId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  const { showId } = await ctx.params;

  const rl = rateLimit(`hold:${session.user.id}`, 20, 60_000);
  if (!rl.ok) return NextResponse.json({ error: "Too many requests. Please slow down." }, { status: 429 });

  const json = await req.json().catch(() => null);
  const parsed = holdSeatsSchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  try {
    const result = await holdSeats({ showId, userId: session.user.id, seatIds: parsed.data.seatIds });
    return NextResponse.json({ ok: true, ...result, expiresAt: result.expiresAt.toISOString() });
  } catch (e) {
    if (e instanceof SeatHoldError) {
      const status = e.code === "UNAVAILABLE" ? 409 : e.code === "NOT_FOUND" ? 404 : 400;
      return NextResponse.json({ error: e.message, code: e.code, seatIds: e.seatIds }, { status });
    }
    console.error(e);
    return NextResponse.json({ error: "Failed to hold seats" }, { status: 500 });
  }
}
