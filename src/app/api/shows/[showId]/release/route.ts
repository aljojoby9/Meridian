import { NextResponse } from "next/server";
import { getApiSession } from "@/server/guards";
import { container } from "@/server/container";
import { releaseSeatsSchema } from "@/modules/seating/schemas";
import { jsonError, readJson } from "@/shared/server/http";

export async function POST(req: Request, ctx: { params: Promise<{ showId: string }> }) {
  const session = await getApiSession();
  if (!session) return jsonError("Authentication required", 401);
  const { showId } = await ctx.params;
  const parsed = releaseSeatsSchema.safeParse(await readJson(req));
  if (!parsed.success) return jsonError(parsed.error.flatten(), 400);

  await container().seating.releaseHold.execute({ showId, userId: session.user.id, holdToken: parsed.data.holdToken, seatIds: parsed.data.seatIds });
  return NextResponse.json({ ok: true });
}
