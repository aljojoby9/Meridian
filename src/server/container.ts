/**
 * Composition root. The only place that knows which adapter implements which
 * port. Routes, pages, and server actions get use cases from here; modules
 * never import this file. Identity is wired in ./auth.ts so the Edge
 * middleware bundle stays small.
 */
import { prisma } from "@/shared/server/db";
import { serverEnv } from "@/shared/server/env";
import { cryptoIdGenerator, systemClock } from "@/shared/server/system";

import { GetActiveHold, GetShowInventory, HoldSeats, ReleaseHold } from "@/modules/seating/application/use-cases";
import { PrismaSeatHoldRepository } from "@/modules/seating/infrastructure/prisma-seat-hold.repository";
import { PrismaShowInventoryReader } from "@/modules/seating/infrastructure/prisma-show-inventory.reader";
import { cryptoHoldTokenGenerator } from "@/modules/seating/infrastructure/crypto-hold-token.generator";

import { ConfirmPaidBooking } from "@/modules/booking/application/confirm-paid-booking";
import { StartCheckout } from "@/modules/booking/application/start-checkout";
import { HandlePaymentEvent } from "@/modules/booking/application/handle-payment-event";
import { GetPaymentStatus, ReconcilePaidCheckout } from "@/modules/booking/application/reconcile-paid-checkout";
import { PrismaBookingRepository, PrismaBookingUnitOfWork, PrismaShowLookup } from "@/modules/booking/infrastructure/prisma-booking.repository";
import { PrismaBookingQueries } from "@/modules/booking/infrastructure/prisma-booking.queries";
import { StripePaymentGateway } from "@/modules/booking/infrastructure/stripe/stripe-payment-gateway";
import { StripeWebhookVerifier } from "@/modules/booking/infrastructure/stripe/stripe-webhook";
import { qrcodeTicketRenderer } from "@/modules/booking/infrastructure/qrcode-ticket-renderer";

import { PrismaCatalogQueries } from "@/modules/catalog/infrastructure/prisma-catalog.queries";

import { CreateShow } from "@/modules/admin/application/create-show";
import { PrismaAdminQueries } from "@/modules/admin/infrastructure/prisma-admin.queries";
import { PrismaShowScheduler } from "@/modules/admin/infrastructure/prisma-show-scheduler";

function build() {
  // Seating
  const seatHolds = new PrismaSeatHoldRepository(prisma);
  const getActiveHold = new GetActiveHold(seatHolds);
  const seating = {
    holdSeats: new HoldSeats(seatHolds, cryptoHoldTokenGenerator, systemClock, serverEnv.seatHoldMinutes),
    releaseHold: new ReleaseHold(seatHolds),
    getShowInventory: new GetShowInventory(seatHolds, new PrismaShowInventoryReader(prisma)),
  };

  // Booking (reads holds through seating, pays through Stripe)
  const stripeKeys = () => ({
    secretKey: serverEnv.stripeSecretKey(),
    publishableKey: serverEnv.stripePublishableKey(),
    webhookSecret: serverEnv.stripeWebhookSecret(),
  });
  const payments = new StripePaymentGateway(stripeKeys);
  const confirmPaidBooking = new ConfirmPaidBooking(new PrismaBookingUnitOfWork(prisma), cryptoIdGenerator);
  const booking = {
    startCheckout: new StartCheckout(
      { findActiveHold: (showId, userId, holdToken) => getActiveHold.execute(showId, userId, holdToken) },
      new PrismaShowLookup(prisma),
      new PrismaBookingRepository(prisma),
      payments,
      confirmPaidBooking,
      serverEnv,
      systemClock,
    ),
    reconcilePaidCheckout: new ReconcilePaidCheckout(payments, confirmPaidBooking),
    paymentStatus: new GetPaymentStatus(payments),
    handlePaymentEvent: new HandlePaymentEvent(confirmPaidBooking),
    webhooks: new StripeWebhookVerifier(stripeKeys),
    queries: new PrismaBookingQueries(prisma),
    ticketQr: qrcodeTicketRenderer,
  };

  const catalog = { queries: new PrismaCatalogQueries(prisma) };

  const admin = {
    queries: new PrismaAdminQueries(prisma),
    createShow: new CreateShow(new PrismaShowScheduler(prisma)),
  };

  return { seating, booking, catalog, admin };
}

export type Container = ReturnType<typeof build>;

let instance: Container | undefined;

/** The app's wired use cases, built once per server process. */
export function container(): Container {
  return (instance ??= build());
}
