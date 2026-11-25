import Link from "next/link";
import { CONFIRMED } from "@/modules/booking/domain/booking";
import { container } from "@/server/container";
import { requireUser } from "@/server/guards";

export default async function CheckoutSuccessPage({
  searchParams,
}: {
  searchParams: Promise<{ bookingId?: string; session_id?: string }>;
}) {
  const session = await requireUser();
  const { bookingId, session_id } = await searchParams;
  if (!bookingId)
    return (
      <main className="mx-auto max-w-2xl px-4 py-10">
        Missing booking reference. <Link className="text-gold underline" href="/bookings">View bookings</Link>
      </main>
    );

  const { booking: bookings } = container();
  let booking = await bookings.queries.findDetails(bookingId);
  if (!booking || booking.userId !== session.user.id)
    return <main className="mx-auto max-w-2xl px-4 py-10">Booking not found.</main>;

  // Safety net: if the webhook hasn't arrived yet (or was never configured),
  // verify the PAID Checkout Session directly and confirm here. The confirm
  // is idempotent, so a webhook arriving at the same time is harmless.
  if (session_id && booking.status !== CONFIRMED) {
    try {
      const confirmed = await bookings.reconcilePaidCheckout.execute({ booking, checkoutSessionId: session_id });
      if (confirmed) booking = (await bookings.queries.findDetails(bookingId)) ?? booking;
    } catch (err) {
      // Never hide the confirmation page because of a verification hiccup.
      console.error("success-page confirmation failed", err);
    }
  }

  const tickets = await Promise.all(
    booking.tickets.map(async (t) => ({ ...t, qrDataUrl: await bookings.ticketQr.toDataUrl(t.qrPayload) })),
  );

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <div className="rounded-2xl border border-border bg-panel p-6 shadow-glow">
        <p className="text-[11px] uppercase tracking-[0.2em] text-gold">
          {booking.status === CONFIRMED ? "Booking Confirmed" : "Booking Pending"}
        </p>
        <h1 className="mt-1 text-2xl font-semibold">{booking.show.movie.title}</h1>
        <p className="text-sm text-muted">
          {booking.show.hall.cinema.name} · {booking.show.hall.name} · {new Date(booking.show.startsAt).toLocaleString()}
        </p>
        <p className="mt-2 text-sm">Confirmation code: <span className="font-mono text-gold">{booking.confirmationCode}</span></p>
        <p className="text-sm text-muted">
          Status: {booking.status}
          {booking.status !== CONFIRMED
            ? " (if you just paid, refresh in a moment while payment confirmation finalizes tickets)"
            : ""}
        </p>
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          {tickets.map((t) => (
            <div key={t.id} className="rounded-xl border border-border bg-panel2 p-4 text-center">
              <div className="font-semibold">Seat {t.seatLabel}</div>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={t.qrDataUrl} alt={`QR code for seat ${t.seatLabel}`} className="mx-auto mt-3 rounded-lg bg-white p-2" />
              <div className="mt-2 text-xs text-muted">Present this QR at entry</div>
            </div>
          ))}
          {tickets.length === 0 && (
            <div className="rounded-xl border border-border bg-panel2 p-4 text-sm text-muted">
              Tickets will appear after payment confirmation.
            </div>
          )}
        </div>
        <div className="mt-6 flex gap-3">
          <Link href="/bookings" className="text-sm text-gold hover:underline">My bookings</Link>
          <Link href="/" className="text-sm text-muted hover:text-text">Home</Link>
        </div>
      </div>
    </main>
  );
}
