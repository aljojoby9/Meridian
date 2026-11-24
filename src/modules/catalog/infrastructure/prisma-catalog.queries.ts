import type { PrismaClient } from "@prisma/client";
import type { CatalogQueries, CinemaListing, CinemaSchedule, ShowListing } from "../application/read-models";

const HOUR_MS = 3600_000;

export class PrismaCatalogQueries implements CatalogQueries {
  constructor(private readonly db: PrismaClient) {}

  listUpcomingShows(): Promise<ShowListing[]> {
    return this.db.show.findMany({
      where: { startsAt: { gte: new Date(Date.now() - 2 * HOUR_MS) } },
      include: { movie: true, hall: { include: { cinema: true } } },
      orderBy: { startsAt: "asc" },
      take: 12,
    });
  }

  async listCinemas(): Promise<CinemaListing[]> {
    const cinemas = await this.db.cinema.findMany({ include: { _count: { select: { halls: true } } }, orderBy: { name: "asc" } });
    return cinemas.map((c) => ({ id: c.id, name: c.name, city: c.city, address: c.address, hallCount: c._count.halls }));
  }

  getCinemaSchedule(cinemaId: string): Promise<CinemaSchedule | null> {
    return this.db.cinema.findUnique({
      where: { id: cinemaId },
      include: {
        halls: {
          include: {
            shows: {
              where: { startsAt: { gte: new Date(Date.now() - HOUR_MS) } },
              include: { movie: true },
              orderBy: { startsAt: "asc" },
              take: 20,
            },
          },
        },
      },
    });
  }
}
