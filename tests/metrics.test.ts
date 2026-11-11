import { describe, expect, it } from "vitest";
import { computeSeatMetrics } from "@/lib/metrics";

const screen = { screenWidthM: 12, screenHeightM: 5, hallDepthM: 18 };

describe("computeSeatMetrics", () => {
  it("labels a close centered seat as Up Close", () => {
    const m = computeSeatMetrics({ x: 0, y: 1.2, z: 3.2, rowIndex: 0 }, screen);
    expect(m.label).toBe("Up Close");
    expect(m.distanceM).toBeCloseTo(3.2, 1);
    expect(m.offsetSide).toBe("center");
  });

  it("labels a middle centered seat as Sweet Spot or Full Picture", () => {
    const m = computeSeatMetrics({ x: 0.1, y: 1.2, z: 9, rowIndex: 5 }, screen);
    expect(["Sweet Spot", "Full Picture"]).toContain(m.label);
    expect(m.viewingAngleDeg).toBeLessThan(5);
  });

  it("flags strong horizontal offset as Side View", () => {
    const m = computeSeatMetrics({ x: 6, y: 1.2, z: 8, rowIndex: 4 }, screen);
    expect(m.label).toBe("Side View");
    expect(m.offsetSide).toBe("right");
  });

  it("computes a reasonable horizontal FOV", () => {
    const m = computeSeatMetrics({ x: 0, y: 1.2, z: 10, rowIndex: 6 }, screen);
    expect(m.horizontalFovDeg).toBeGreaterThan(30);
    expect(m.horizontalFovDeg).toBeLessThan(90);
  });
});
