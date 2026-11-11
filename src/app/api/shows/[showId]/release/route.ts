import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { releaseHold } from "@/lib/seat-lock";
import { releaseSeatsSchema } from "@/lib/validations";

export async function POST(req: Request, ctx: { params: Promise<{ showId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  const { showId } = await ctx.params;
  const json = await req.json().catch(() => null);
  const parsed = releaseSeatsSchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  await releaseHold({ showId, userId: session.user.id, holdToken: parsed.data.holdToken, seatIds: parsed.data.seatIds });
  return NextResponse.json({ ok: true });
}
