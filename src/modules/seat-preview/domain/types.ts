/**
 * Hall geometry shared by the metrics, the Aperture matcher, and the camera.
 *
 * Coordinate system (matches the seed and the 3D scene):
 * - Screen plane at z = 0, centred on x = 0, spanning y = 0 .. screenHeightM.
 * - Seats sit at z > 0 (distance from the screen) and face -z.
 * - x is the horizontal offset from the hall centreline; y is eye height.
 */
export interface ScreenGeometry {
  screenWidthM: number;
  screenHeightM: number;
  hallDepthM: number;
}

export interface SeatGeometry {
  x: number;
  y: number;
  z: number;
  rowIndex: number;
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
