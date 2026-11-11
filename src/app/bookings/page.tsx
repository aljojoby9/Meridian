import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth-guards";
import { formatMoney } from "@/lib/utils";

export default async function BookingsPage() {
  const session = await requireUser();
  const bookings = await prisma.booking.findMany({
    where: { userId: session.user.id },
    include: { show: { include: { movie: true, hall: { include: { cinema: true } } } }, tickets: true },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  return (
    <main className="mx-auto max-w-4xl px-4 py-8">
      <h1 className="text-2xl font-semibold">My bookings</h1>
      <div className="mt-5 space-y-3">
        {bookings.map((b) => (
          <Link key={b.id} href={`/checkout/success?bookingId=${b.id}`} className="block rounded-2xl border border-border bg-panel p-4 hover:border-gold/30">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="font-semibold">{b.show.movie.title}</div>
                <div className="text-sm text-muted">{b.show.hall.cinema.name} · {new Date(b.show.startsAt).toLocaleString()}</div>
                <div className="mt-1 text-xs text-muted">Seats: {b.tickets.map((t) => t.seatLabel).join(", ") || "Pending"} · {b.confirmationCode}</div>
              </div>
              <div className="text-right">
                <div className="text-sm font-medium text-gold">{formatMoney(b.totalAmount, b.currency)}</div>
                <div className="text-xs text-muted">{b.status}</div>
              </div>
            </div>
          </Link>
        ))}
        {bookings.length === 0 && <div className="rounded-2xl border border-border bg-panel p-6 text-muted">No bookings yet.</div>}
      </div>
    </main>
  );
}
