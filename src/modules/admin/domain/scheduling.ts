/** Rules for scheduling shows and reporting on them. */

/** A seat's price for a show: the show's base price plus the seat's modifier (cents). */
export function seatPrice(basePrice: number, priceModifier: number): number {
  return basePrice + priceModifier;
}

export interface NewShowRequest {
  movieId: string;
  hallId: string;
  startsAt: Date;
  /** Cents. */
  basePrice: number;
}

/** A show needs a movie, a hall, a valid start time, and a positive price. */
export function isSchedulable(request: NewShowRequest): boolean {
  return Boolean(request.movieId) && Boolean(request.hallId) && !Number.isNaN(request.startsAt.getTime()) && request.basePrice > 0;
}

/** Share of seats booked, as a whole percentage. */
export function occupancyPercent(booked: number, total: number): number {
  return total ? Math.round((booked / total) * 100) : 0;
}
