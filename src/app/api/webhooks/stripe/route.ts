import { NextResponse } from "next/server";
import { headers } from "next/headers";
import type { PaymentEvent } from "@/modules/booking/domain/payment-event";
import { WebhookVerificationError } from "@/modules/booking/domain/errors";
import { container } from "@/server/container";
import { jsonError } from "@/shared/server/http";

export async function POST(req: Request) {
  const body = await req.text();
  const sig = (await headers()).get("stripe-signature");
  const { booking } = container();

  let event: PaymentEvent | null;
  try {
    event = booking.webhooks.verify(body, sig);
  } catch (err: unknown) {
    if (err instanceof WebhookVerificationError) {
      return jsonError(`Signature verification failed: ${err.message}`, 400);
    }
    throw err;
  }
  if (!event) return jsonError("Webhook not configured", 400);

  try {
    await booking.handlePaymentEvent.execute(event);
    return NextResponse.json({ received: true });
  } catch (e) {
    console.error("Stripe webhook handler error", e);
    // Return 500 so Stripe retries for transient failures; idempotent confirm handles duplicates.
    return jsonError("Webhook handler failed", 500);
  }
}
