import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { getStripe } from "@/lib/stripe";
import { confirmBookingFromStripe } from "@/lib/booking";
import Stripe from "stripe";

export async function POST(req: Request) {
  const body = await req.text();
  const sig = (await headers()).get("stripe-signature");
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!sig || !secret) return NextResponse.json({ error: "Webhook not configured" }, { status: 400 });

  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(body, sig, secret);
  } catch (err: any) {
    return NextResponse.json({ error: `Signature verification failed: ${err.message}` }, { status: 400 });
  }

  try {
    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      const bookingId = session.metadata?.bookingId;
      if (bookingId && session.payment_status === "paid") {
        await confirmBookingFromStripe({
          bookingId,
          checkoutSessionId: session.id,
          paymentIntentId: typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id,
          rawEvent: event,
        });
      }
    }
    return NextResponse.json({ received: true });
  } catch (e) {
    console.error("Stripe webhook handler error", e);
    // Return 500 so Stripe retries for transient failures; idempotent confirm handles duplicates.
    return NextResponse.json({ error: "Webhook handler failed" }, { status: 500 });
  }
}
