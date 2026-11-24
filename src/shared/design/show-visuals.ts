/**
 * Show-page picture and chrome. The hall meshes and the seat map read these
 * values directly so contrast and overlap stay testable without WebGL.
 */

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

export interface Viewport {
  width: number;
  height: number;
}

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Surfaces in the 3D hall. Pairwise separation is part of the show-page contract. */
export const hallColors = {
  floor: "#241910",
  wall: "#071428",
  bezel: "#3a342c",
  seatOpen: "#7e90c9",
  seatSelected: "#f2c14e",
  seatTaken: "#c44762",
  /** Unveiled screen fill. Brighter than the wall. */
  screenPicture: "#d5e2ff",
} as const;

/**
 * The picture plane matches the screen frame. Nothing translucent is drawn
 * between the audience and that plane.
 */
export const screenFrame = {
  pictureScale: 1,
  veilInFront: false,
  veilOpacity: 0,
} as const;

/** Seat-map fills. Aperture is its own swatch, not a ring on Available. */
export const mapColors = {
  available: "#31405c",
  aperture: "#1f6b45",
  selected: "#f2c14e",
  held: "#8a6230",
  taken: "#6e2438",
} as const;

export const SHOW_VIEWPORTS = {
  phone: { width: 390, height: 844 },
  desktop: { width: 1280, height: 800 },
} as const;

const TOP_CONTROL_H = 44;
const METRICS_H = 132;
const METRICS_GAP = 8;
const SHEET_H = 220;

/** Central 40% of the canvas. Chrome must stay outside it. */
export function pictureRegion(viewport: Viewport): Box {
  return {
    x: viewport.width * 0.3,
    y: viewport.height * 0.3,
    width: viewport.width * 0.4,
    height: viewport.height * 0.4,
  };
}

/**
 * Rectangles for the show-page controls. The same numbers drive the live layout.
 * Top band holds the controls and the metrics readout. The selection sheet sits
 * in the bottom band. Neither enters the central picture.
 */
export function showChrome(viewport: Viewport): {
  topControls: Box;
  metrics: Box;
  status: Box;
  selectionSheet: Box;
  picture: Box;
} {
  const pad = viewport.width < 640 ? 12 : 16;
  const picture = pictureRegion(viewport);
  const topControls: Box = {
    x: pad,
    y: pad,
    width: viewport.width - pad * 2,
    height: TOP_CONTROL_H,
  };
  const metrics: Box = {
    x: pad,
    y: pad + TOP_CONTROL_H + METRICS_GAP,
    width: Math.min(300, viewport.width - pad * 2),
    height: METRICS_H,
  };
  const statusTop = metrics.y + metrics.height + 4;
  const status: Box = {
    x: pad,
    y: statusTop,
    width: viewport.width - pad * 2,
    height: Math.max(0, picture.y - statusTop - 4),
  };
  const selectionSheet: Box = {
    x: pad,
    y: viewport.height - pad - SHEET_H,
    width: viewport.width - pad * 2,
    height: SHEET_H,
  };
  return { topControls, metrics, status, selectionSheet, picture };
}
