/** Query side of the catalog: what the listing pages render. */

export interface ShowListing {
  id: string;
  startsAt: Date;
  format: string;
  basePrice: number;
  currency: string;
  movie: { title: string; posterUrl: string | null };
  hall: { name: string; cinema: { name: string } };
}

export interface CinemaListing {
  id: string;
  name: string;
  city: string;
  address: string | null;
  hallCount: number;
}

export interface CinemaSchedule {
  id: string;
  name: string;
  city: string;
  address: string | null;
  halls: Array<{
    id: string;
    name: string;
    shows: Array<{ id: string; startsAt: Date; format: string; basePrice: number; currency: string; movie: { title: string } }>;
  }>;
}

export interface CatalogQueries {
  /** Up to 12 shows that started at most two hours ago or later, soonest first. */
  listUpcomingShows(): Promise<ShowListing[]>;
  /** All cinemas by name. */
  listCinemas(): Promise<CinemaListing[]>;
  /** A cinema with each hall's next 20 shows (from one hour ago), or `null`. */
  getCinemaSchedule(cinemaId: string): Promise<CinemaSchedule | null>;
}
