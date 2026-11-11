import type { ShowFormat } from "@prisma/client";

export type SeatStatusView = "available" | "taken" | "recliner" | "selected" | "held";
export type SeatTypeValue = "STANDARD" | "RECLINER" | "PREMIUM" | "ACCESSIBLE";
export type ShowSeatStatusValue = "AVAILABLE" | "HELD" | "BOOKED" | "BLOCKED";

export interface SeatViewModel {
  id: string;
  seatId: string;
  rowLabel: string;
  number: number;
  rowIndex: number;
  colIndex: number;
  type: SeatTypeValue;
  status: ShowSeatStatusValue;
  price: number; // cents
  x: number;
  y: number;
  z: number;
  holdExpiresAt: string | null;
  heldByCurrentUser: boolean;
}

export interface SeatMetrics {
  distanceM: number;
  horizontalFovDeg: number;
  viewingAngleDeg: number;
  horizontalOffsetM: number;
  offsetSide: "center" | "left" | "right";
  label: "Up Close" | "Sweet Spot" | "Full Picture" | "Rear View" | "Side View";
  description: string;
}

export interface HoldResponse {
  ok: boolean;
  holdToken?: string;
  expiresAt?: string;
  seatIds?: string[];
  error?: string;
}

export interface CheckoutResponse {
  ok: boolean;
  url?: string;
  error?: string;
}

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
