import { computeSeatMetrics, type ScreenGeometry } from "./metrics";
import type { SeatMetrics } from "@/types";

/** How the guest likes the picture. Aperture ranks open seats against this. */
export type AperturePreference = "closer" | "balanced" | "wider";

export interface ApertureSeat {
  seatId: string;
  x: number;
  y: number;
  z: number;
  rowIndex: number;
  status: string;
  heldByCurrentUser?: boolean;
}

const DISTANCE_TARGET: Record<AperturePreference, number> = {
  closer: 0.24,
  balanced: 0.48,
  wider: 0.72,
};

const FOV_TARGET: Record<AperturePreference, number> = {
  closer: 70,
  balanced: 52,
  wider: 38,
};

export function apertureScore(metrics: SeatMetrics, preference: AperturePreference, hallDepthM: number): number {
  const depth = metrics.distanceM / Math.max(hallDepthM, 1);
  const depthScore = Math.max(0, 1 - Math.abs(depth - DISTANCE_TARGET[preference]) / 0.45);
  const centerScore = Math.max(0, 1 - metrics.viewingAngleDeg / 35);
  const fovScore = Math.max(0, 1 - Math.abs(metrics.horizontalFovDeg - FOV_TARGET[preference]) / 50);
  const sidePenalty = metrics.label === "Side View" ? 0.35 : 1;
  const raw = (depthScore * 0.5 + centerScore * 0.35 + fovScore * 0.15) * sidePenalty;
  return Math.round(Math.max(0, Math.min(1, raw)) * 100);
}

export function rankApertureSeats<T extends ApertureSeat>(
  seats: T[],
  screen: ScreenGeometry,
  preference: AperturePreference,
  limit = 8,
): Array<{ seat: T; score: number }> {
  return seats
    .filter((seat) => seat.status === "AVAILABLE" || (seat.status === "HELD" && seat.heldByCurrentUser))
    .map((seat) => ({
      seat,
      score: apertureScore(computeSeatMetrics(seat, screen), preference, screen.hallDepthM),
    }))
    .sort((a, b) => b.score - a.score || Math.abs(a.seat.x) - Math.abs(b.seat.x) || a.seat.rowIndex - b.seat.rowIndex)
    .slice(0, limit);
}
