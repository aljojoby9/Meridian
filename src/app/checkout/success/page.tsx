import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth-guards";
import { ticketQrDataUrl } from "@/lib/booking";

export default async function CheckoutSuccessPage({ searchParams }: { searchParams: Promise<{ bookingId?: string }> }) {
  const session = await requireUser();
  const { bookingId } = await searchParams;
  if (!bookingId) return <main className="mx-auto max-w-2xl px-4 py-10">Missing booking reference. <Link className="text-gold underline" href="/bookings">View bookings</Link></main>;

  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: { show: { include: { movie: true, hall: { include: { cinema: true } } } }, tickets: true, showSeats: { include: { seat: true } } },
  });
  if (!booking || booking.userId !== session.user.id) return <main className="mx-auto max-w-2xl px-4 py-10">Booking not found.</main>;

  const tickets = await Promise.all(booking.tickets.map(async (t) => ({ ...t, qrDataUrl: await ticketQrDataUrl(t.qrPayload) })));

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <div className="rounded-2xl border border-border bg-panel p-6 shadow-glow">
        <p className="text-[11px] uppercase tracking-[0.2em] text-gold">Booking Confirmed</p>
        <h1 className="mt-1 text-2xl font-semibold">{booking.show.movie.title}</h1>
        <p className="text-sm text-muted">
          {booking.show.hall.cinema.name} · {booking.show.hall.name} · {new Date(booking.show.startsAt).toLocaleString()}
        </p>
        <p className="mt-2 text-sm">Confirmation code: <span className="font-mono text-gold">{booking.confirmationCode}</span></p>
        <p className="text-sm text-muted">Status: {booking.status}{booking.status !== "CONFIRMED" ? " (if you just paid, refresh in a moment while the Stripe webhook finalizes tickets)" : ""}</p>
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
            <div className="rounded-xl border border-border bg-panel2 p-4 text-sm text-muted">Tickets will appear after payment confirmation.</div>
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
