import { afterEach, describe, expect, it, vi } from "vitest";
import { ConfirmPaidBooking } from "@/modules/booking/application/confirm-paid-booking";
import { StartCheckout } from "@/modules/booking/application/start-checkout";
import { HandlePaymentEvent } from "@/modules/booking/application/handle-payment-event";
import { describeCheckoutFailure } from "@/modules/booking/application/checkout-failure";
import type {
  BookingForConfirmation,
  BookingUnitOfWork,
  CheckoutSessionRequest,
  ConfirmationStore,
  HeldSeat,
  PaidSessionCheck,
  PaymentConfigStatus,
  PaymentGateway,
} from "@/modules/booking/application/ports";
import { GetPaymentStatus, ReconcilePaidCheckout } from "@/modules/booking/application/reconcile-paid-checkout";
import { earliestHoldExpiry, totalPrice } from "@/modules/booking/domain/booking";
import { NoActiveHoldError, PaymentsNotConfiguredError, SeatsNoLongerHeldError, ShowNotFoundError } from "@/modules/booking/domain/errors";

const NOW = new Date("2026-01-01T20:00:00.000Z");
const clock = { now: () => NOW };
const ids = { uuid: () => "ticket-uuid" };

/* ---------- confirmation fakes ---------- */

function fakeUnitOfWork(booking: BookingForConfirmation | null) {
  const writes: string[] = [];
  const tickets: Array<{ showSeatId: string; seatLabel: string; qrPayload: string }> = [];
  const payments: unknown[] = [];
  const store: ConfirmationStore = {
    findForConfirmation: async () => booking,
    markSeatsBooked: async (id) => void writes.push(`seats-booked:${id}`),
    markConfirmed: async (id, p) => void writes.push(`confirmed:${id}:${p.checkoutSessionId}:${p.paymentIntentId}`),
    recordPayment: async (p) => void payments.push(p),
    issueTicket: async (t) => void tickets.push(t),
  };
  let transactions = 0;
  const uow: BookingUnitOfWork = {
    run: async (work) => {
      transactions++;
      return work(store);
    },
  };
  return { uow, writes, tickets, payments, transactions: () => transactions };
}

const pendingBooking = (over: Partial<BookingForConfirmation> = {}): BookingForConfirmation => ({
  id: "b1",
  showId: "show-1",
  status: "PENDING_PAYMENT",
  confirmationCode: "CODE",
  totalAmount: 2400,
  currency: "usd",
  ticketCount: 0,
  seats: [
    { showSeatId: "ss1", status: "HELD", rowLabel: "D", number: 7 },
    { showSeatId: "ss2", status: "HELD", rowLabel: "D", number: 8 },
  ],
  ...over,
});

describe("booking rules", () => {
  it("totals prices and expires with the first hold", () => {
    const a = new Date("2026-01-01T20:05:00Z");
    const b = new Date("2026-01-01T20:03:00Z");
    const seats = [
      { price: 1200, holdExpiresAt: a },
      { price: 1500, holdExpiresAt: null },
      { price: 900, holdExpiresAt: b },
    ];
    expect(totalPrice(seats)).toBe(3600);
    expect(earliestHoldExpiry(seats)).toBe(b);
    expect(earliestHoldExpiry([])).toBeNull();
  });
});

describe("ConfirmPaidBooking", () => {
  it("books seats, confirms, records payment, and issues one QR ticket per seat in one transaction", async () => {
    const fake = fakeUnitOfWork(pendingBooking());
    await new ConfirmPaidBooking(fake.uow, ids).execute({ bookingId: "b1", checkoutSessionId: "cs_1", paymentIntentId: "pi_1", rawEvent: { e: 1 } });

    expect(fake.transactions()).toBe(1);
    expect(fake.writes).toEqual(["seats-booked:b1", "confirmed:b1:cs_1:pi_1"]);
    expect(fake.payments).toEqual([
      { bookingId: "b1", amount: 2400, currency: "usd", checkoutSessionId: "cs_1", paymentIntentId: "pi_1", rawEvent: { e: 1 } },
    ]);
    expect(fake.tickets.map((t) => [t.showSeatId, t.seatLabel])).toEqual([
      ["ss1", "D7"],
      ["ss2", "D8"],
    ]);
    expect(JSON.parse(fake.tickets[0]!.qrPayload)).toEqual({ v: 1, bookingId: "b1", code: "CODE", showId: "show-1", seat: "D7", ticketId: "ticket-uuid" });
  });

  it("is idempotent for an already confirmed booking", async () => {
    const fake = fakeUnitOfWork(pendingBooking({ status: "CONFIRMED" }));
    await new ConfirmPaidBooking(fake.uow, ids).execute({ bookingId: "b1", checkoutSessionId: "cs_1" });
    expect(fake.writes).toEqual([]);
    expect(fake.tickets).toEqual([]);
  });

  it("does not issue tickets twice", async () => {
    const fake = fakeUnitOfWork(pendingBooking({ ticketCount: 2 }));
    await new ConfirmPaidBooking(fake.uow, ids).execute({ bookingId: "b1", checkoutSessionId: "cs_1" });
    expect(fake.writes).toEqual(["seats-booked:b1", "confirmed:b1:cs_1:null"]);
    expect(fake.tickets).toEqual([]);
  });

  it("refuses when a seat is no longer held, and when the booking is missing", async () => {
    const lost = fakeUnitOfWork(pendingBooking({ seats: [{ showSeatId: "ss1", status: "AVAILABLE", rowLabel: "A", number: 1 }] }));
    await expect(new ConfirmPaidBooking(lost.uow, ids).execute({ bookingId: "b1", checkoutSessionId: "cs" })).rejects.toBeInstanceOf(SeatsNoLongerHeldError);
    expect(lost.writes).toEqual([]);

    const missing = fakeUnitOfWork(null);
    await expect(new ConfirmPaidBooking(missing.uow, ids).execute({ bookingId: "nope", checkoutSessionId: "cs" })).rejects.toThrow("Booking not found");
  });
});

/* ---------- checkout ---------- */

const held: HeldSeat[] = [
  { id: "ss1", price: 1200, holdExpiresAt: new Date("2026-01-01T20:10:00Z"), seat: { rowLabel: "D", number: 7 } },
  { id: "ss2", price: 1500, holdExpiresAt: new Date("2026-01-01T20:08:00Z"), seat: { rowLabel: "D", number: 8 } },
];

const LIVE: PaymentConfigStatus = { mode: "live", secretKey: true, publishableKey: true, webhookSecret: true, missing: [] };
const DEMO: PaymentConfigStatus = {
  mode: "demo",
  secretKey: true,
  publishableKey: true,
  webhookSecret: false,
  missing: ["STRIPE_WEBHOOK_SECRET"],
};

function fakeGateway(opts: { configured?: boolean; gatewayFails?: boolean; session?: Partial<PaidSessionCheck> } = {}) {
  const sessions: CheckoutSessionRequest[] = [];
  const retrieved: string[] = [];
  const gateway: PaymentGateway = {
    status: () => ((opts.configured ?? true) ? LIVE : DEMO),
    createCheckoutSession: async (req) => {
      sessions.push(req);
      if (opts.gatewayFails) throw new Error("stripe down");
      return { id: "cs_123", url: "https://pay.example/cs_123" };
    },
    retrieveCheckoutSession: async (id) => {
      retrieved.push(id);
      return { id, paid: true, bookingId: "b1", paymentIntentId: "pi_1", raw: { id }, ...opts.session };
    },
  };
  return { gateway, sessions, retrieved };
}

function setupCheckout(
  opts: { configured?: boolean; production?: boolean; allowDemo?: boolean; held?: HeldSeat[]; gatewayFails?: boolean; show?: boolean } = {},
) {
  const created: unknown[] = [];
  const attached: string[] = [];
  const confirmed: unknown[] = [];
  const { gateway, sessions } = fakeGateway(opts);
  const confirm = { execute: async (input: unknown) => void confirmed.push(input) } as unknown as ConfirmPaidBooking;
  const useCase = new StartCheckout(
    { findActiveHold: async () => opts.held ?? held },
    {
      findForCheckout: async () =>
        opts.show === false
          ? null
          : { currency: "usd", startsAt: new Date("2026-01-02T19:30:00Z"), movieTitle: "Film", hallName: "Hall 1", cinemaName: "Meridian" },
    },
    {
      createPending: async (input) => (created.push(input), { id: "b1" }),
      attachCheckoutSession: async (id, sessionId) => void attached.push(`${id}:${sessionId}`),
    },
    gateway,
    confirm,
    { appOrigin: () => "https://app.test", isProduction: () => opts.production ?? false, allowDemoCheckout: () => opts.allowDemo ?? false },
    clock,
  );
  return { useCase, created, attached, sessions, confirmed };
}

const input = { showId: "show-1", holdToken: "hold_tok", userId: "u1", email: "guest@example.test" };

describe("StartCheckout", () => {
  afterEach(() => vi.restoreAllMocks());

  it("creates a pending booking from the active hold", async () => {
    const { useCase, created } = setupCheckout();
    await useCase.execute(input);
    expect(created).toEqual([
      { userId: "u1", showId: "show-1", totalAmount: 2700, currency: "usd", expiresAt: new Date("2026-01-01T20:08:00Z"), showSeatIds: ["ss1", "ss2"] },
    ]);
  });

  it("opens a payment session with one line item per seat and the hold in metadata", async () => {
    const { useCase, sessions, attached, confirmed } = setupCheckout();
    const result = await useCase.execute(input);

    expect(result).toEqual({ url: "https://pay.example/cs_123", bookingId: "b1", demo: false });
    expect(attached).toEqual(["b1:cs_123"]);
    expect(confirmed).toEqual([]);
    const session = sessions[0]!;
    expect(session.customerEmail).toBe("guest@example.test");
    expect(session.lineItems.map((l) => [l.name, l.unitAmount, l.currency])).toEqual([
      ["Film — Seat D7", 1200, "usd"],
      ["Film — Seat D8", 1500, "usd"],
    ]);
    expect(session.successUrl).toBe("https://app.test/checkout/success?bookingId=b1&session_id={CHECKOUT_SESSION_ID}");
    expect(session.cancelUrl).toBe("https://app.test/shows/show-1?canceled=1");
    expect(session.metadata).toEqual({ bookingId: "b1", showId: "show-1", userId: "u1", holdToken: "hold_tok" });
    expect(session.expiresAt).toBe(Math.floor(NOW.getTime() / 1000) + 31 * 60);
  });

  it("confirms locally in demo mode when no payment provider is configured", async () => {
    const { useCase, sessions, confirmed } = setupCheckout({ configured: false });
    const result = await useCase.execute(input);
    expect(result).toEqual({ url: "https://app.test/checkout/success?bookingId=b1&mode=demo", bookingId: "b1", demo: true });
    expect(sessions).toEqual([]);
    expect(confirmed).toEqual([
      { bookingId: "b1", checkoutSessionId: "demo_b1", paymentIntentId: null, rawEvent: { source: "demo-checkout", at: NOW.toISOString() } },
    ]);
  });

  it("falls back to demo mode on a provider failure outside production only", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const dev = setupCheckout({ gatewayFails: true });
    expect((await dev.useCase.execute(input)).demo).toBe(true);

    const prod = setupCheckout({ gatewayFails: true, production: true });
    await expect(prod.useCase.execute(input)).rejects.toThrow("stripe down");
    expect(prod.confirmed).toEqual([]);
  });

  it("fails closed in production with placeholder credentials, before creating a booking", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const prod = setupCheckout({ configured: false, production: true });
    const run = prod.useCase.execute(input);
    await expect(run).rejects.toBeInstanceOf(PaymentsNotConfiguredError);
    await expect(run).rejects.toMatchObject({
      message: "Payments are not configured. Set real values for: STRIPE_WEBHOOK_SECRET.",
      missing: ["STRIPE_WEBHOOK_SECRET"],
    });
    expect(prod.created).toEqual([]);
    expect(prod.confirmed).toEqual([]);
  });

  it("allows demo checkout in production only when explicitly enabled", async () => {
    const optedIn = setupCheckout({ configured: false, production: true, allowDemo: true });
    expect((await optedIn.useCase.execute(input)).demo).toBe(true);
  });

  it("rejects an expired hold and an unknown show", async () => {
    await expect(setupCheckout({ held: [] }).useCase.execute(input)).rejects.toBeInstanceOf(NoActiveHoldError);
    await expect(setupCheckout({ show: false }).useCase.execute(input)).rejects.toBeInstanceOf(ShowNotFoundError);
  });
});

describe("describeCheckoutFailure", () => {
  it("maps an expired hold to 409 and everything else to 400", () => {
    expect(describeCheckoutFailure(new NoActiveHoldError())).toEqual({ message: "Your seat hold expired. Please select a seat again.", status: 409 });
    expect(describeCheckoutFailure(new ShowNotFoundError())).toEqual({ message: "Show not found.", status: 400 });
    expect(describeCheckoutFailure("boom")).toEqual({ message: "Checkout failed", status: 400 });
  });
});

describe("ReconcilePaidCheckout (success-page safety net)", () => {
  const pending = { id: "b1", status: "PENDING_PAYMENT", stripeCheckoutSessionId: "cs_123" };
  function setup(gatewayOpts: Parameters<typeof fakeGateway>[0] = {}) {
    const calls: unknown[] = [];
    const confirm = { execute: async (i: unknown) => void calls.push(i) } as unknown as ConfirmPaidBooking;
    const { gateway, retrieved } = fakeGateway(gatewayOpts);
    return { useCase: new ReconcilePaidCheckout(gateway, confirm), calls, retrieved };
  }

  it("confirms a paid session that matches the booking", async () => {
    const { useCase, calls } = setup();
    expect(await useCase.execute({ booking: pending, checkoutSessionId: "cs_123" })).toBe(true);
    expect(calls).toEqual([{ bookingId: "b1", checkoutSessionId: "cs_123", paymentIntentId: "pi_1", rawEvent: { id: "cs_123" } }]);
  });

  it("matches by metadata when the booking has no stored session id", async () => {
    const { useCase, calls } = setup();
    expect(await useCase.execute({ booking: { ...pending, stripeCheckoutSessionId: null }, checkoutSessionId: "cs_other" })).toBe(true);
    expect(calls).toHaveLength(1);
  });

  it("does nothing for confirmed bookings, demo mode, unpaid sessions, or another booking's session", async () => {
    const confirmed = setup();
    expect(await confirmed.useCase.execute({ booking: { ...pending, status: "CONFIRMED" }, checkoutSessionId: "cs_123" })).toBe(false);
    expect(confirmed.retrieved).toEqual([]);

    const demo = setup({ configured: false });
    expect(await demo.useCase.execute({ booking: pending, checkoutSessionId: "cs_123" })).toBe(false);
    expect(demo.retrieved).toEqual([]);

    const unpaid = setup({ session: { paid: false } });
    expect(await unpaid.useCase.execute({ booking: pending, checkoutSessionId: "cs_123" })).toBe(false);

    const foreign = setup({ session: { bookingId: "someone-else" } });
    expect(await foreign.useCase.execute({ booking: pending, checkoutSessionId: "cs_999" })).toBe(false);
    expect([unpaid.calls, foreign.calls]).toEqual([[], []]);
  });

  it("reports payment status without key values", () => {
    expect(new GetPaymentStatus(fakeGateway({ configured: false }).gateway).execute()).toEqual(DEMO);
  });
});

describe("HandlePaymentEvent", () => {
  const confirmSpy = () => {
    const calls: unknown[] = [];
    return { calls, confirm: { execute: async (i: unknown) => void calls.push(i) } as unknown as ConfirmPaidBooking };
  };

  it("confirms a paid completed checkout", async () => {
    const { calls, confirm } = confirmSpy();
    await new HandlePaymentEvent(confirm).execute({ kind: "checkout_completed", bookingId: "b1", checkoutSessionId: "cs", paymentIntentId: "pi", paid: true, raw: { id: "evt" } });
    expect(calls).toEqual([{ bookingId: "b1", checkoutSessionId: "cs", paymentIntentId: "pi", rawEvent: { id: "evt" } }]);
  });

  it("ignores unpaid sessions, missing bookings, and other events", async () => {
    const { calls, confirm } = confirmSpy();
    const handler = new HandlePaymentEvent(confirm);
    await handler.execute({ kind: "checkout_completed", bookingId: "b1", checkoutSessionId: "cs", paymentIntentId: null, paid: false, raw: {} });
    await handler.execute({ kind: "checkout_completed", bookingId: null, checkoutSessionId: "cs", paymentIntentId: null, paid: true, raw: {} });
    await handler.execute({ kind: "ignored", type: "charge.refunded" });
    expect(calls).toEqual([]);
  });
});
