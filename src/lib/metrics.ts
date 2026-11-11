import type { SeatMetrics } from "@/types";
import { clamp } from "./utils";

export interface SeatGeometry {
  x: number;
  y: number;
  z: number;
  rowIndex: number;
}

export interface ScreenGeometry {
  screenWidthM: number;
  screenHeightM: number;
  hallDepthM: number;
}

/**
 * Coordinate system (matches seed and 3D scene):
 * - Screen plane at z = 0, centered at x = 0. Screen center point = (0, screenHeightM/2, 0)
 * - Audience seats are at z > 0 (distance/depth away from screen), facing -z toward screen.
 * - x is horizontal offset from hall centerline; y is eye height.
 */
export function computeSeatMetrics(seat: SeatGeometry, screen: ScreenGeometry): SeatMetrics {
  const distanceM = Math.max(0.5, seat.z);
  const horizontalOffsetM = Math.abs(seat.x);
  const offsetSide = Math.abs(seat.x) < 0.25 ? "center" : seat.x < 0 ? "left" : "right";

  // Horizontal angle subtended by the screen from this seat position.
  // Left/right screen edge x at z=0.
  const halfW = screen.screenWidthM / 2;
  const angleToLeft = Math.atan2(-halfW - seat.x, distanceM);
  const angleToRight = Math.atan2(halfW - seat.x, distanceM);
  const horizontalFovDeg = Math.abs(angleToRight - angleToLeft) * (180 / Math.PI);

  // Viewing angle relative to centerline (obliqueness).
  const viewingAngleDeg = Math.abs(Math.atan2(seat.x, distanceM) * (180 / Math.PI));

  const label = classifySeat(distanceM, horizontalFovDeg, viewingAngleDeg, screen.hallDepthM);
  const description = describe(label, distanceM, viewingAngleDeg);

  return {
    distanceM: round1(distanceM),
    horizontalFovDeg: round1(clamp(horizontalFovDeg, 5, 170)),
    viewingAngleDeg: round1(viewingAngleDeg),
    horizontalOffsetM: round1(horizontalOffsetM),
    offsetSide,
    label,
    description,
  };
}

function classifySeat(
  distanceM: number,
  fovDeg: number,
  obliqueDeg: number,
  hallDepthM: number,
): SeatMetrics["label"] {
  if (obliqueDeg > 28) return "Side View";
  const depthRatio = distanceM / Math.max(hallDepthM, 1);
  if (depthRatio < 0.28 || fovDeg > 75) return "Up Close";
  if (depthRatio > 0.78) return "Rear View";
  if (depthRatio >= 0.33 && depthRatio <= 0.62 && obliqueDeg < 16 && fovDeg >= 35 && fovDeg <= 65) {
    return "Sweet Spot";
  }
  return "Full Picture";
}

function describe(label: SeatMetrics["label"], distanceM: number, obliqueDeg: number): string {
  switch (label) {
    case "Up Close":
      return "Immersive and intense; expect more head/eye movement.";
    case "Sweet Spot":
      return "Balanced screen coverage with comfortable viewing geometry.";
    case "Full Picture":
      return "Comfortable overall view with the full frame in context.";
    case "Rear View":
      return "Widest room perspective; screen appears smaller but stable.";
    case "Side View":
      return `Offset by ${round1(obliqueDeg)}° from center; some image skew is possible.`;
  }
}

function round1(n: number) {
  return Math.round(n * 10) / 10;
}
