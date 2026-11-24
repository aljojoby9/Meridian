import { occupancyPercent } from "@/modules/admin/domain/scheduling";
import { container } from "@/server/container";
import { formatMoney } from "@/shared/lib/format";

export default async function AdminBookingsPage() {
  const { bookings, occupancy } = await container().admin.queries.bookingsAndOccupancy();

  return (
    <div className="space-y-6">
      <section>
        <h2 className="mb-3 font-semibold">Occupancy</h2>
        <div className="overflow-x-auto rounded-2xl border border-border">
          <table className="min-w-full text-sm">
            <thead className="bg-panel text-left text-muted"><tr><th className="px-4 py-3">Show</th><th className="px-4 py-3">Total</th><th className="px-4 py-3">Booked</th><th className="px-4 py-3">Held</th><th className="px-4 py-3">Occupancy</th></tr></thead>
            <tbody>
              {occupancy.map((s) => {
                const pct = occupancyPercent(s.booked, s.totalSeats);
                return (
                  <tr key={s.id} className="border-t border-border bg-[#0b0e14]">
                    <td className="px-4 py-3">{new Date(s.startsAt).toLocaleString()} · {s.movieTitle} ({s.hallName})</td>
                    <td className="px-4 py-3">{s.totalSeats}</td>
                    <td className="px-4 py-3">{s.booked}</td>
                    <td className="px-4 py-3">{s.held}</td>
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
                  <td className="px-4 py-3 text-muted">{b.userEmail}</td>
                  <td className="px-4 py-3">{b.movieTitle}</td>
                  <td className="px-4 py-3">{b.seatLabels.join(", ") || "—"}</td>
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
