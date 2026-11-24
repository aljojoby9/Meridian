import type { ShowFormat } from "@/modules/catalog/domain/show-format";

/** Writes for show scheduling. */
export interface ShowScheduler {
  /** The hall's seats that can be sold. */
  activeSeats(hallId: string): Promise<Array<{ id: string; priceModifier: number }>>;
  /** Create the show and its AVAILABLE seat inventory in one transaction. */
  createShow(
    show: { movieId: string; hallId: string; startsAt: Date; format: ShowFormat; basePrice: number },
    inventory: Array<{ seatId: string; price: number }>,
  ): Promise<void>;
}

export interface DashboardStats {
  cinemas: number;
  halls: number;
  /** Shows from the last 24 hours onward. */
  shows: number;
  bookings: number;
  bookedSeats: number;
}

export interface HallOverview {
  id: string;
  name: string;
  cinemaName: string;
  rows: number;
  seatsPerRow: number;
  firstRowDistanceM: number;
  hallDepthM: number;
  screenWidthM: number;
  screenHeightM: number;
  seatCount: number;
  showCount: number;
}

export interface AdminShowsData {
  shows: Array<{ id: string; startsAt: Date; format: string; basePrice: number; movieTitle: string; cinemaName: string; hallName: string; bookingCount: number }>;
  movies: Array<{ id: string; title: string }>;
  halls: Array<{ id: string; name: string; cinemaName: string }>;
}

export interface BookingsAndOccupancy {
  bookings: Array<{ id: string; createdAt: Date; userEmail: string; movieTitle: string; seatLabels: string[]; totalAmount: number; currency: string; status: string }>;
  occupancy: Array<{ id: string; startsAt: Date; movieTitle: string; hallName: string; totalSeats: number; booked: number; held: number }>;
}

/** Read models for the operator console. */
export interface AdminQueries {
  dashboardStats(): Promise<DashboardStats>;
  halls(): Promise<HallOverview[]>;
  /** The 50 latest shows plus the movie and hall options for the create form. */
  showsData(): Promise<AdminShowsData>;
  /** The 100 latest bookings and occupancy for up to 30 shows from the last day on. */
  bookingsAndOccupancy(): Promise<BookingsAndOccupancy>;
}
