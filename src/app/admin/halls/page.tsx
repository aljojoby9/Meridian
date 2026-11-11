import { prisma } from "@/lib/db";

export default async function AdminHallsPage() {
  const halls = await prisma.hall.findMany({ include: { cinema: true, _count: { select: { seats: true, shows: true } } }, orderBy: [{ cinema: { name: "asc" } }, { name: "asc" }] });
  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-border bg-panel p-4 text-sm text-muted">
        Seat layouts and 3D geometry are defined per hall (rows, spacing, screen size, first-row distance, eye height). Per-seat coordinates are stored in <code>Seat.x/y/z</code> and can be overridden for irregular layouts. Use Prisma Studio or an admin API extension to edit geometry in production.
      </div>
      <div className="overflow-x-auto rounded-2xl border border-border">
        <table className="min-w-full text-sm">
          <thead className="bg-panel text-left text-muted">
            <tr>
              <th className="px-4 py-3">Cinema</th><th className="px-4 py-3">Hall</th><th className="px-4 py-3">Layout</th><th className="px-4 py-3">Screen</th><th className="px-4 py-3">Seats</th><th className="px-4 py-3">Shows</th>
            </tr>
          </thead>
          <tbody>
            {halls.map((h) => (
              <tr key={h.id} className="border-t border-border bg-[#0b0e14]">
                <td className="px-4 py-3">{h.cinema.name}</td>
                <td className="px-4 py-3 font-medium">{h.name}</td>
                <td className="px-4 py-3 text-muted">{h.rows} rows × {h.seatsPerRow} · first row {h.firstRowDistanceM}m · depth {h.hallDepthM}m</td>
                <td className="px-4 py-3 text-muted">{h.screenWidthM}m × {h.screenHeightM}m</td>
                <td className="px-4 py-3">{h._count.seats}</td>
                <td className="px-4 py-3">{h._count.shows}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
