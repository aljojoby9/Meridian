import { prisma } from "@/lib/db";

export default async function AdminDashboard() {
  const [cinemas, halls, shows, bookings, bookedSeats] = await Promise.all([
    prisma.cinema.count(),
    prisma.hall.count(),
    prisma.show.count({ where: { startsAt: { gte: new Date(Date.now() - 86400_000) } } }),
    prisma.booking.count({ where: { status: "CONFIRMED" } }),
    prisma.showSeat.count({ where: { status: "BOOKED" } }),
  ]);
  const cards = [
    ["Cinemas", cinemas],
    ["Halls", halls],
    ["Upcoming/recent shows", shows],
    ["Confirmed bookings", bookings],
    ["Booked seats", bookedSeats],
  ] as const;
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
      {cards.map(([label, value]) => (
        <div key={label} className="rounded-2xl border border-border bg-panel p-4">
          <div className="text-sm text-muted">{label}</div>
          <div className="mt-1 text-2xl font-semibold">{value}</div>
        </div>
      ))}
      <div className="sm:col-span-2 lg:col-span-5 rounded-2xl border border-border bg-panel p-4 text-sm text-muted">
        Manage halls, seat geometry, shows, and occupancy from the admin navigation. Production deployments should add audit logging, stronger operator workflows, and GLTF hall model uploads.
      </div>
    </div>
  );
}
