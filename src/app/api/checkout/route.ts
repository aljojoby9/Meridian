import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { checkoutSchema } from "@/lib/validations";
import { createPendingBooking, confirmBookingFromStripe } from "@/lib/booking";
import { getStripe } from "@/lib/stripe";
import { rateLimit } from "@/lib/rate-limit";
import { prisma } from "@/lib/db";

/**
 * Stripe is only considered configured when a real secret key is present.
 * Placeholder values (e.g. "sk_test_...") route checkout to demo mode so the
 * booking flow always completes end-to-end locally.
 */
function isStripeConfigured() {
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  return Boolean(key && key.length > 12 && !key.includes("..."));
}

/** Confirms the booking locally and returns the demo success redirect. */
async function demoCheckout(booking: { id: string }, origin: string) {
  await confirmBookingFromStripe({
    bookingId: booking.id,
    checkoutSessionId: `demo_${booking.id}`,
    paymentIntentId: null,
    rawEvent: { source: "demo-checkout", at: new Date().toISOString() },
  });
  return NextResponse.json({
    ok: true,
    url: `${origin}/checkout/success?bookingId=${booking.id}&mode=demo`,
    bookingId: booking.id,
    demo: true,
  });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  const rl = rateLimit(`checkout:${session.user.id}`, 10, 60_000);
  if (!rl.ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

  const json = await req.json().catch(() => null);
  const parsed = checkoutSchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const { showId, holdToken } = parsed.data;
  const origin = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

  try {
    const booking = await createPendingBooking({ showId, userId: session.user.id, holdToken });

    // Demo mode: no real Stripe keys configured -> confirm locally so the
    // booking flow still completes end-to-end (local dev / demos).
    if (!isStripeConfigured()) {
      return await demoCheckout(booking, origin);
    }

    const stripe = getStripe();
    try {
      const checkout = await stripe.checkout.sessions.create({
        mode: "payment",
        customer_email: session.user.email ?? undefined,
        line_items: booking.seats.map((seat) => ({
          quantity: 1,
          price_data: {
            currency: booking.currency,
            unit_amount: seat.price,
            product_data: {
              name: `${booking.movieTitle} — Seat ${seat.seatLabel}`,
              description: `${booking.cinemaName}, ${booking.hallName}, ${new Date(booking.startsAt).toLocaleString()}`,
            },
          },
        })),
        success_url: `${origin}/checkout/success?bookingId=${booking.id}&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${origin}/shows/${showId}?canceled=1`,
        metadata: {
          bookingId: booking.id,
          showId,
          userId: session.user.id,
          holdToken,
        },
        expires_at: Math.floor(Date.now() / 1000) + 31 * 60,
      });

      await prisma.booking.update({ where: { id: booking.id }, data: { stripeCheckoutSessionId: checkout.id } });
      return NextResponse.json({ ok: true, url: checkout.url, bookingId: booking.id });
    } catch (stripeErr: unknown) {
      // A real (non-placeholder) key existed but Stripe itself failed. In
      // non-production we fall back to demo confirmation instead of stranding
      // the user; production surfaces the error normally.
      const message = stripeErr instanceof Error ? stripeErr.message : "Stripe session failed";
      if (process.env.NODE_ENV !== "production") {
        console.warn("stripe checkout unavailable, falling back to demo:", message);
        return await demoCheckout(booking, origin);
      }
      throw stripeErr;
    }
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Checkout failed";
    const expired = /expired|no active held seats/i.test(message);
    console.error("checkout error", message);
    return NextResponse.json(
      { error: expired ? "Your seat hold expired. Please select a seat again." : message },
      { status: expired ? 409 : 400 },
    );
  }
}
