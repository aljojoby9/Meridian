import type { ShowFormat } from "./show-format";

/** The show, movie, hall, and cinema details the show page needs. */
export interface ShowSummary {
  id: string;
  startsAt: string;
  format: ShowFormat;
  basePrice: number;
  currency: string;
  movie: { id: string; title: string; posterUrl: string | null; durationMin: number; rating: string | null; trailerUrl: string | null };
  hall: { id: string; name: string; screenWidthM: number; screenHeightM: number; hallDepthM: number; hallWidthM: number };
  cinema: { id: string; name: string; city: string; slug: string };
}

/** Any show record carrying the fields a ShowSummary is built from. */
export interface ShowSummarySource {
  id: string;
  startsAt: Date;
  format: string;
  basePrice: number;
  currency: string;
  movie: ShowSummary["movie"];
  hall: ShowSummary["hall"] & { cinema: ShowSummary["cinema"] };
}

/** Serialisable show summary for client components. */
export function toShowSummary(show: ShowSummarySource): ShowSummary {
  return {
    id: show.id,
    startsAt: show.startsAt.toISOString(),
    format: show.format as ShowFormat,
    basePrice: show.basePrice,
    currency: show.currency,
    movie: { id: show.movie.id, title: show.movie.title, posterUrl: show.movie.posterUrl, durationMin: show.movie.durationMin, rating: show.movie.rating, trailerUrl: show.movie.trailerUrl },
    hall: { id: show.hall.id, name: show.hall.name, screenWidthM: show.hall.screenWidthM, screenHeightM: show.hall.screenHeightM, hallDepthM: show.hall.hallDepthM, hallWidthM: show.hall.hallWidthM },
    cinema: { id: show.hall.cinema.id, name: show.hall.cinema.name, city: show.hall.cinema.city, slug: show.hall.cinema.slug },
  };
}
