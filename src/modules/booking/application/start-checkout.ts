import type { Clock } from "@/shared/kernel/ports";
import { seatLabel } from "@/shared/lib/format";
import { CHECKOUT_SESSION_MINUTES, earliestHoldExpiry, totalPrice } from "../domain/booking";
import { NoActiveHoldError, PaymentsNotConfiguredError, ShowNotFoundError } from "../domain/errors";
import type { ConfirmPaidBooking } from "./confirm-paid-booking";
import type { ActiveHoldReader, BookingRepository, CheckoutConfig, CheckoutShow, PaymentGateway, ShowLookup } from "./ports";

export interface StartCheckoutInput {
  showId: string;
  holdToken: string;
  userId: string;
  email?: string | null;
}

export interface CheckoutResult {
  url: string | null;
  bookingId: string;
  /** True when the booking was confirmed locally instead of through the payment provider. */
  demo: boolean;
}

interface PendingBooking {
  id: string;
  show: CheckoutShow;
  seats: Array<{ seatLabel: string; price: number }>;
}

/**
 * Turns the caller's active hold into a PENDING_PAYMENT booking and starts
 * payment. While any payment credential is a placeholder the booking is
 * confirmed locally (demo mode) so the flow still completes end to end.
 * Production refuses demo mode (`PaymentsNotConfiguredError`) unless
 * explicitly allowed. Outside production a provider failure falls back to
 * demo mode as well.
 */
export class StartCheckout {
  constructor(
    private readonly holds: ActiveHoldReader,
    private readonly shows: ShowLookup,
    private readonly bookings: BookingRepository,
    private readonly payments: PaymentGateway,
    private readonly confirmPaidBooking: ConfirmPaidBooking,
    private readonly config: CheckoutConfig,
    private readonly clock: Clock,
  ) {}

  async execute(input: StartCheckoutInput): Promise<CheckoutResult> {
    const origin = this.config.appOrigin();

    // Config check FIRST: the production fail-closed path must not strand a
    // PENDING_PAYMENT booking and seat hold that could never be confirmed.
    const payment = this.payments.status();
    const useDemo = payment.mode === "demo";
    if (useDemo && this.config.isProduction() && !this.config.allowDemoCheckout()) {
      console.error("checkout blocked: Stripe is not configured", payment.missing.join(", "));
      throw new PaymentsNotConfiguredError(payment.missing);
    }

    const booking = await this.createPendingBooking(input);

    // Not every payment credential is real -> demo mode. Production only gets
    // here with placeholders when ALLOW_DEMO_CHECKOUT is set explicitly.
    if (useDemo) {
      return this.confirmAsDemo(booking.id, origin);
    }

    try {
      return await this.openPaymentSession(booking, input, origin);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Stripe session failed";
      if (!this.config.isProduction()) {
        console.warn("stripe checkout unavailable, falling back to demo:", message);
        return this.confirmAsDemo(booking.id, origin);
      }
      throw err;
    }
  }

  private async createPendingBooking({ showId, userId, holdToken }: StartCheckoutInput): Promise<PendingBooking> {
    const held = await this.holds.findActiveHold(showId, userId, holdToken);
    if (!held.length) throw new NoActiveHoldError();

    const show = await this.shows.findForCheckout(showId);
    if (!show) throw new ShowNotFoundError();

    const { id } = await this.bookings.createPending({
      userId,
      showId,
      totalAmount: totalPrice(held),
      currency: show.currency,
      expiresAt: earliestHoldExpiry(held),
      showSeatIds: held.map((s) => s.id),
    });

    return {
      id,
      show,
      seats: held.map((s) => ({ seatLabel: seatLabel(s.seat.rowLabel, s.seat.number), price: s.price })),
    };
  }

  private async openPaymentSession(booking: PendingBooking, input: StartCheckoutInput, origin: string): Promise<CheckoutResult> {
    const { show } = booking;
    const session = await this.payments.createCheckoutSession({
      customerEmail: input.email ?? undefined,
      lineItems: booking.seats.map((seat) => ({
        name: `${show.movieTitle} — Seat ${seat.seatLabel}`,
        description: `${show.cinemaName}, ${show.hallName}, ${new Date(show.startsAt).toLocaleString()}`,
        unitAmount: seat.price,
        currency: show.currency,
      })),
      successUrl: `${origin}/checkout/success?bookingId=${booking.id}&session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl: `${origin}/shows/${input.showId}?canceled=1`,
      metadata: {
        bookingId: booking.id,
        showId: input.showId,
        userId: input.userId,
        holdToken: input.holdToken,
      },
      expiresAt: Math.floor(this.clock.now().getTime() / 1000) + CHECKOUT_SESSION_MINUTES * 60,
    });

    await this.bookings.attachCheckoutSession(booking.id, session.id);
    return { url: session.url, bookingId: booking.id, demo: false };
  }

  private async confirmAsDemo(bookingId: string, origin: string): Promise<CheckoutResult> {
    await this.confirmPaidBooking.execute({
      bookingId,
      checkoutSessionId: `demo_${bookingId}`,
      paymentIntentId: null,
      rawEvent: { source: "demo-checkout", at: this.clock.now().toISOString() },
    });
    return {
      url: `${origin}/checkout/success?bookingId=${bookingId}&mode=demo`,
      bookingId,
      demo: true,
    };
  }
}
