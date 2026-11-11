import { prisma } from "@/lib/db";
import { formatMoney } from "@/lib/utils";

export default async function AdminBookingsPage() {
  const [bookings, occupancy] = await Promise.all([
    prisma.booking.findMany({ include: { user: true, show: { include: { movie: true, hall: { include: { cinema: true } } } }, tickets: true }, orderBy: { createdAt: "desc" }, take: 100 }),
    prisma.show.findMany({
      where: { startsAt: { gte: new Date(Date.now() - 86400_000) } },
      include: { movie: true, hall: true, _count: { select: { showSeats: true } }, showSeats: { where: { status: { in: ["BOOKED", "HELD"] } }, select: { status: true } } },
      orderBy: { startsAt: "asc" },
      take: 30,
    }),
  ]);

  return (
    <div className="space-y-6">
      <section>
        <h2 className="mb-3 font-semibold">Occupancy</h2>
        <div className="overflow-x-auto rounded-2xl border border-border">
          <table className="min-w-full text-sm">
            <thead className="bg-panel text-left text-muted"><tr><th className="px-4 py-3">Show</th><th className="px-4 py-3">Total</th><th className="px-4 py-3">Booked</th><th className="px-4 py-3">Held</th><th className="px-4 py-3">Occupancy</th></tr></thead>
            <tbody>
              {occupancy.map((s) => {
                const booked = s.showSeats.filter((x) => x.status === "BOOKED").length;
                const held = s.showSeats.filter((x) => x.status === "HELD").length;
                const pct = s._count.showSeats ? Math.round((booked / s._count.showSeats) * 100) : 0;
                return (
                  <tr key={s.id} className="border-t border-border bg-[#0b0e14]">
                    <td className="px-4 py-3">{new Date(s.startsAt).toLocaleString()} · {s.movie.title} ({s.hall.name})</td>
                    <td className="px-4 py-3">{s._count.showSeats}</td>
                    <td className="px-4 py-3">{booked}</td>
                    <td className="px-4 py-3">{held}</td>
                    <td className="px-4 py-3">{pct}%</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
      <section>
        <h2 className="mb-3 font-semibold">Recent bookings</h2>
        <div className="overflow-x-auto rounded-2xl border border-border">
          <table className="min-w-full text-sm">
            <thead className="bg-panel text-left text-muted"><tr><th className="px-4 py-3">Created</th><th className="px-4 py-3">User</th><th className="px-4 py-3">Show</th><th className="px-4 py-3">Seats</th><th className="px-4 py-3">Amount</th><th className="px-4 py-3">Status</th></tr></thead>
            <tbody>
              {bookings.map((b) => (
                <tr key={b.id} className="border-t border-border bg-[#0b0e14]">
                  <td className="px-4 py-3">{new Date(b.createdAt).toLocaleString()}</td>
                  <td className="px-4 py-3 text-muted">{b.user.email}</td>
                  <td className="px-4 py-3">{b.show.movie.title}</td>
                  <td className="px-4 py-3">{b.tickets.map((t) => t.seatLabel).join(", ") || "—"}</td>
                  <td className="px-4 py-3">{formatMoney(b.totalAmount, b.currency)}</td>
                  <td className="px-4 py-3">{b.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
