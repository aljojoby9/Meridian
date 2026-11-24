import type { PrismaClient } from "@prisma/client";
import type { AdminQueries, AdminShowsData, BookingsAndOccupancy, DashboardStats, HallOverview } from "../application/ports";

const DAY_MS = 86400_000;

export class PrismaAdminQueries implements AdminQueries {
  constructor(private readonly db: PrismaClient) {}

  async dashboardStats(): Promise<DashboardStats> {
    const [cinemas, halls, shows, bookings, bookedSeats] = await Promise.all([
      this.db.cinema.count(),
      this.db.hall.count(),
      this.db.show.count({ where: { startsAt: { gte: new Date(Date.now() - DAY_MS) } } }),
      this.db.booking.count({ where: { status: "CONFIRMED" } }),
      this.db.showSeat.count({ where: { status: "BOOKED" } }),
    ]);
    return { cinemas, halls, shows, bookings, bookedSeats };
  }

  async halls(): Promise<HallOverview[]> {
    const halls = await this.db.hall.findMany({
      include: { cinema: true, _count: { select: { seats: true, shows: true } } },
      orderBy: [{ cinema: { name: "asc" } }, { name: "asc" }],
    });
    return halls.map((h) => ({
      id: h.id,
      name: h.name,
      cinemaName: h.cinema.name,
      rows: h.rows,
      seatsPerRow: h.seatsPerRow,
      firstRowDistanceM: h.firstRowDistanceM,
      hallDepthM: h.hallDepthM,
      screenWidthM: h.screenWidthM,
      screenHeightM: h.screenHeightM,
      seatCount: h._count.seats,
      showCount: h._count.shows,
    }));
  }

  async showsData(): Promise<AdminShowsData> {
    const [shows, movies, halls] = await Promise.all([
      this.db.show.findMany({ include: { movie: true, hall: { include: { cinema: true } }, _count: { select: { bookings: true } } }, orderBy: { startsAt: "desc" }, take: 50 }),
      this.db.movie.findMany({ orderBy: { title: "asc" } }),
      this.db.hall.findMany({ include: { cinema: true }, orderBy: [{ cinema: { name: "asc" } }, { name: "asc" }] }),
    ]);
    return {
      shows: shows.map((s) => ({
        id: s.id,
        startsAt: s.startsAt,
        format: s.format,
        basePrice: s.basePrice,
        movieTitle: s.movie.title,
        cinemaName: s.hall.cinema.name,
        hallName: s.hall.name,
        bookingCount: s._count.bookings,
      })),
      movies: movies.map((m) => ({ id: m.id, title: m.title })),
      halls: halls.map((h) => ({ id: h.id, name: h.name, cinemaName: h.cinema.name })),
    };
  }

  async bookingsAndOccupancy(): Promise<BookingsAndOccupancy> {
    const [bookings, occupancy] = await Promise.all([
      this.db.booking.findMany({ include: { user: true, show: { include: { movie: true, hall: { include: { cinema: true } } } }, tickets: true }, orderBy: { createdAt: "desc" }, take: 100 }),
      this.db.show.findMany({
        where: { startsAt: { gte: new Date(Date.now() - DAY_MS) } },
        include: { movie: true, hall: true, _count: { select: { showSeats: true } }, showSeats: { where: { status: { in: ["BOOKED", "HELD"] } }, select: { status: true } } },
        orderBy: { startsAt: "asc" },
        take: 30,
      }),
    ]);
    return {
      bookings: bookings.map((b) => ({
        id: b.id,
        createdAt: b.createdAt,
        userEmail: b.user.email,
        movieTitle: b.show.movie.title,
        seatLabels: b.tickets.map((t) => t.seatLabel),
        totalAmount: b.totalAmount,
        currency: b.currency,
        status: b.status,
      })),
      occupancy: occupancy.map((s) => ({
        id: s.id,
        startsAt: s.startsAt,
        movieTitle: s.movie.title,
        hallName: s.hall.name,
        totalSeats: s._count.showSeats,
        booked: s.showSeats.filter((x) => x.status === "BOOKED").length,
        held: s.showSeats.filter((x) => x.status === "HELD").length,
      })),
    };
  }
}
