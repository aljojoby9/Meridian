import { describe, expect, it } from "vitest";
import { apertureScore, rankApertureSeats, type ApertureSeat } from "@/lib/aperture";
import { computeSeatMetrics } from "@/lib/metrics";

const screen = { screenWidthM: 12, screenHeightM: 5, hallDepthM: 18 };

function seat(partial: Partial<ApertureSeat> & Pick<ApertureSeat, "seatId" | "z">): ApertureSeat {
  return {
    x: 0,
    y: 1.2,
    rowIndex: 4,
    status: "AVAILABLE",
    ...partial,
  };
}

describe("aperture", () => {
  it("prefers a near centered seat when the guest wants a closer picture", () => {
    const near = apertureScore(computeSeatMetrics({ x: 0, y: 1.2, z: 4, rowIndex: 1 }, screen), "closer", 18);
    const far = apertureScore(computeSeatMetrics({ x: 0, y: 1.2, z: 15, rowIndex: 11 }, screen), "closer", 18);
    expect(near).toBeGreaterThan(far);
  });

  it("prefers a farther centered seat when the guest wants a wider picture", () => {
    const near = apertureScore(computeSeatMetrics({ x: 0, y: 1.2, z: 4, rowIndex: 1 }, screen), "wider", 18);
    const far = apertureScore(computeSeatMetrics({ x: 0, y: 1.2, z: 14, rowIndex: 10 }, screen), "wider", 18);
    expect(far).toBeGreaterThan(near);
  });

  it("scores a centered seat above a strong side seat", () => {
    const center = apertureScore(computeSeatMetrics({ x: 0, y: 1.2, z: 9, rowIndex: 5 }, screen), "balanced", 18);
    const side = apertureScore(computeSeatMetrics({ x: 6, y: 1.2, z: 9, rowIndex: 5 }, screen), "balanced", 18);
    expect(center).toBeGreaterThan(side);
  });

  it("skips seats that are already booked", () => {
    const ranked = rankApertureSeats(
      [
        seat({ seatId: "taken", z: 9, status: "BOOKED" }),
        seat({ seatId: "open", z: 9, status: "AVAILABLE" }),
      ],
      screen,
      "balanced",
    );
    expect(ranked.map((row) => row.seat.seatId)).toEqual(["open"]);
  });
});
