/** Driven ports of the booking module. Adapters live in ../infrastructure. */

import type { PaymentEvent } from "../domain/payment-event";

/** A held seat that can be turned into a booking. */
export interface HeldSeat {
  id: string;
  price: number;
  holdExpiresAt: Date | null;
  seat: { rowLabel: string; number: number };
}

/** Reads the caller's active hold (provided by the seating module). */
export interface ActiveHoldReader {
  findActiveHold(showId: string, userId: string, holdToken: string): Promise<HeldSeat[]>;
}

/** What checkout needs to know about a show. */
export interface CheckoutShow {
  currency: string;
  startsAt: Date;
  movieTitle: string;
  hallName: string;
  cinemaName: string;
}

export interface ShowLookup {
  findForCheckout(showId: string): Promise<CheckoutShow | null>;
}

export interface BookingRepository {
  /** Create a PENDING_PAYMENT booking that owns the given show seats. */
  createPending(input: {
    userId: string;
    showId: string;
    totalAmount: number;
    currency: string;
    expiresAt: Date | null;
    showSeatIds: string[];
  }): Promise<{ id: string }>;
  attachCheckoutSession(bookingId: string, checkoutSessionId: string): Promise<void>;
}

/** A booking as the confirmation step sees it. */
export interface BookingForConfirmation {
  id: string;
  showId: string;
  status: string;
  confirmationCode: string;
  totalAmount: number;
  currency: string;
  ticketCount: number;
  seats: Array<{ showSeatId: string; status: string; rowLabel: string; number: number }>;
}

/** Writes that confirm a paid booking. Only valid inside `BookingUnitOfWork.run`. */
export interface ConfirmationStore {
  findForConfirmation(bookingId: string): Promise<BookingForConfirmation | null>;
  /** Mark the booking's seats BOOKED and clear their hold. */
  markSeatsBooked(bookingId: string): Promise<void>;
  markConfirmed(bookingId: string, payment: { checkoutSessionId: string; paymentIntentId: string | null }): Promise<void>;
  /** Insert or update the booking's SUCCEEDED payment. */
  recordPayment(input: {
    bookingId: string;
    amount: number;
    currency: string;
    checkoutSessionId: string;
    paymentIntentId: string | null;
    rawEvent: unknown;
  }): Promise<void>;
  issueTicket(input: { bookingId: string; showSeatId: string; seatLabel: string; qrPayload: string }): Promise<void>;
}

/** Runs work in one database transaction: all of it commits, or none. */
export interface BookingUnitOfWork {
  run<T>(work: (store: ConfirmationStore) => Promise<T>): Promise<T>;
}

export interface CheckoutSessionRequest {
  customerEmail?: string;
  lineItems: Array<{ name: string; description: string; unitAmount: number; currency: string }>;
  successUrl: string;
  cancelUrl: string;
  metadata: Record<string, string>;
  /** Unix seconds. */
  expiresAt: number;
}

/**
 * Which payment credentials are real. "live" only when every one is; while any
 * is a placeholder, checkout runs in demo mode. Never contains key values.
 */
export interface PaymentConfigStatus {
  mode: "demo" | "live";
  secretKey: boolean;
  publishableKey: boolean;
  webhookSecret: boolean;
  /** Env var names still holding placeholders. */
  missing: string[];
}

/** A checkout session as read back from the provider. */
export interface PaidSessionCheck {
  id: string;
  paid: boolean;
  /** The booking id stored in the session metadata, if any. */
  bookingId: string | null;
  paymentIntentId: string | null;
  raw: unknown;
}

/** Hosted payment page provider (Stripe in production). */
export interface PaymentGateway {
  status(): PaymentConfigStatus;
  createCheckoutSession(request: CheckoutSessionRequest): Promise<{ id: string; url: string | null }>;
  retrieveCheckoutSession(checkoutSessionId: string): Promise<PaidSessionCheck>;
}

export interface TicketQrRenderer {
  toDataUrl(payload: string): Promise<string>;
}

export interface CheckoutConfig {
  appOrigin(): string;
  isProduction(): boolean;
  /** Production demos only: allow demo confirmation without real payment credentials. */
  allowDemoCheckout(): boolean;
}

/** Verifies a provider webhook and normalises it. See `WebhookVerificationError`. */
export interface PaymentWebhookVerifier {
  /** `null` when the signature or the webhook secret is missing. */
  verify(body: string, signature: string | null): PaymentEvent | null;
}
