/**
 * Booking failures. Messages are user-facing and part of the API contract:
 * the checkout route maps them to HTTP responses.
 */

export class NoActiveHoldError extends Error {
  constructor() {
    super("No active held seats found. Your hold may have expired.");
  }
}

export class ShowNotFoundError extends Error {
  constructor() {
    super("Show not found.");
  }
}

export class BookingNotFoundError extends Error {
  constructor() {
    super("Booking not found");
  }
}

export class SeatsNoLongerHeldError extends Error {
  constructor() {
    super("One or more seats are no longer held; booking cannot be confirmed safely.");
  }
}

/**
 * Checkout refused in production because payment credentials are still
 * placeholders (and demo checkout was not explicitly allowed). Raised before
 * any booking is created, so no seats are stranded.
 */
export class PaymentsNotConfiguredError extends Error {
  constructor(public readonly missing: string[]) {
    super(`Payments are not configured. Set real values for: ${missing.join(", ")}.`);
  }
}

/** A payment-provider webhook whose signature does not match. */
export class WebhookVerificationError extends Error {}
