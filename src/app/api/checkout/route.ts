import { NextResponse } from "next/server";
import { getApiSession } from "@/server/guards";
import { container } from "@/server/container";
import { checkoutSchema } from "@/modules/booking/schemas";
import { describeCheckoutFailure } from "@/modules/booking/application/checkout-failure";
import { PaymentsNotConfiguredError } from "@/modules/booking/domain/errors";
import { rateLimit } from "@/shared/server/rate-limit";
import { jsonError, readJson } from "@/shared/server/http";

/**
 * Reports payment configuration WITHOUT exposing any key values.
 * Use `GET /api/checkout` to confirm the app picked up the keys you just added
 * to `.env` (after restarting the dev server).
 */
export async function GET() {
  const status = container().booking.paymentStatus.execute();
  return NextResponse.json({
    ok: true,
    mode: status.mode,
    configured: {
      secretKey: status.secretKey,
      publishableKey: status.publishableKey,
      webhookSecret: status.webhookSecret,
    },
    missing: status.missing,
    hint: status.mode === "demo"
      ? "Replace the placeholder Stripe values in .env, then restart the dev server."
      : "Stripe Checkout is live.",
  });
}

export async function POST(req: Request) {
  const session = await getApiSession();
  if (!session) return jsonError("Authentication required", 401);
  const rl = rateLimit(`checkout:${session.user.id}`, 10, 60_000);
  if (!rl.ok) return jsonError("Too many requests", 429);

  const parsed = checkoutSchema.safeParse(await readJson(req));
  if (!parsed.success) return jsonError(parsed.error.flatten(), 400);

  try {
    const result = await container().booking.startCheckout.execute({
      showId: parsed.data.showId,
      holdToken: parsed.data.holdToken,
      userId: session.user.id,
      email: session.user.email,
    });
    return NextResponse.json(
      result.demo
        ? { ok: true, url: result.url, bookingId: result.bookingId, demo: true }
        : { ok: true, url: result.url, bookingId: result.bookingId },
    );
  } catch (e: unknown) {
    // Production with placeholder keys fails closed before any booking exists.
    if (e instanceof PaymentsNotConfiguredError) {
      return NextResponse.json({ error: e.message, missing: e.missing }, { status: 503 });
    }
    const failure = describeCheckoutFailure(e);
    console.error("checkout error", e instanceof Error ? e.message : "Checkout failed");
    return jsonError(failure.message, failure.status);
  }
}
