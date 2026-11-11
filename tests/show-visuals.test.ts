import { describe, expect, it } from "vitest";
import { hallColors, mapColors, pictureRegion, screenFrame, showChrome, SHOW_VIEWPORTS, type Box, type Viewport } from "@/lib/show-visuals";

/** Central 40% recomputed here so the test does not trust pictureRegion's formula alone. */
function centralPicture(viewport: Viewport): Box {
  return {
    x: viewport.width * 0.3,
    y: viewport.height * 0.3,
    width: viewport.width * 0.4,
    height: viewport.height * 0.4,
  };
}

function rgb(hex: string): [number, number, number] {
  const n = hex.replace("#", "");
  return [parseInt(n.slice(0, 2), 16), parseInt(n.slice(2, 4), 16), parseInt(n.slice(4, 6), 16)];
}

function distance(a: string, b: string): number {
  const [r1, g1, b1] = rgb(a);
  const [r2, g2, b2] = rgb(b);
  return Math.hypot(r1 - r2, g1 - g2, b1 - b2);
}

/** WCAG relative luminance. Implemented here, not imported from the palette module. */
function relativeLuminance(hex: string): number {
  const channels = rgb(hex).map((channel) => {
    const s = channel / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  const r = channels[0]!;
  const g = channels[1]!;
  const b = channels[2]!;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function overlapArea(a: Box, b: Box): number {
  const width = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const height = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  if (width <= 0 || height <= 0) return 0;
  return width * height;
}

describe("show page visuals", () => {
  const hallSurfaces = [
    hallColors.floor,
    hallColors.wall,
    hallColors.bezel,
    hallColors.seatOpen,
    hallColors.seatSelected,
    hallColors.seatTaken,
  ];

  it("keeps hall surfaces at least 24 apart and the screen brighter than the wall", () => {
    for (let i = 0; i < hallSurfaces.length; i++) {
      for (let j = i + 1; j < hallSurfaces.length; j++) {
        expect(distance(hallSurfaces[i]!, hallSurfaces[j]!)).toBeGreaterThanOrEqual(24);
      }
    }
    expect(relativeLuminance(hallColors.screenPicture)).toBeGreaterThan(relativeLuminance(hallColors.wall));
  });

  it("does not veil the picture plane", () => {
    expect(screenFrame.pictureScale).toBe(1);
    expect(screenFrame.veilInFront).toBe(false);
    expect(screenFrame.veilOpacity).toBe(0);
  });

  it("keeps seat-map states distinguishable", () => {
    const states = [mapColors.available, mapColors.aperture, mapColors.selected, mapColors.held, mapColors.taken];
    for (let i = 0; i < states.length; i++) {
      for (let j = i + 1; j < states.length; j++) {
        expect(distance(states[i]!, states[j]!)).toBeGreaterThanOrEqual(24);
      }
    }
  });

  it.each([SHOW_VIEWPORTS.phone, SHOW_VIEWPORTS.desktop])(
    "keeps chrome outside the central picture on $width×$height",
    (viewport) => {
      const picture = centralPicture(viewport);
      expect(pictureRegion(viewport)).toEqual(picture);
      const chrome = showChrome(viewport);
      expect(chrome.picture).toEqual(picture);

      const boxes = [chrome.topControls, chrome.metrics, chrome.selectionSheet];
      for (const box of boxes) {
        expect(overlapArea(box, picture)).toBe(0);
        expect(box.width).toBeGreaterThan(0);
        expect(box.height).toBeGreaterThan(0);
      }
      for (let i = 0; i < boxes.length; i++) {
        for (let j = i + 1; j < boxes.length; j++) {
          expect(overlapArea(boxes[i]!, boxes[j]!)).toBe(0);
        }
      }
      expect(overlapArea(chrome.status, picture)).toBe(0);
    },
  );
});
