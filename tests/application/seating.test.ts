import { describe, expect, it } from "vitest";
import { GetActiveHold, GetShowInventory, HoldSeats, ReleaseHold } from "@/modules/seating/application/use-cases";
import type { HeldSeat, SeatClaim, SeatHoldRepository, ShowInventory } from "@/modules/seating/application/ports";
import { SeatHoldError } from "@/modules/seating/domain/errors";
import { isClaimableBy, unclaimableSeats } from "@/modules/seating/domain/hold-policy";

const NOW = new Date("2026-01-01T20:00:00.000Z");
const clock = { now: () => NOW };

function fakeHolds(overrides: Partial<SeatHoldRepository> = {}) {
  const calls: string[] = [];
  const claims: SeatClaim[] = [];
  const repo: SeatHoldRepository = {
    expireStaleHolds: async (showId) => void calls.push(`expire:${showId}`),
    claim: async (claim) => void claims.push(claim),
    release: async (p) => void calls.push(`release:${p.showId}:${p.holdToken}`),
    findActiveHold: async () => {
      calls.push("find");
      return [];
    },
    ...overrides,
  };
  return { repo, calls, claims };
}

describe("hold policy", () => {
  it("lets a user claim open seats and their own holds only", () => {
    expect(isClaimableBy({ seatId: "a", status: "AVAILABLE", heldByUserId: null }, "u1")).toBe(true);
    expect(isClaimableBy({ seatId: "a", status: "HELD", heldByUserId: "u1" }, "u1")).toBe(true);
    expect(isClaimableBy({ seatId: "a", status: "HELD", heldByUserId: "u2" }, "u1")).toBe(false);
    expect(isClaimableBy({ seatId: "a", status: "BOOKED", heldByUserId: null }, "u1")).toBe(false);
    expect(
      unclaimableSeats(
        [
          { seatId: "a", status: "AVAILABLE", heldByUserId: null },
          { seatId: "b", status: "BLOCKED", heldByUserId: null },
        ],
        "u1",
      ).map((s) => s.seatId),
    ).toEqual(["b"]);
  });
});

describe("HoldSeats", () => {
  it("claims de-duplicated seats with a fresh token and a policy-based expiry", async () => {
    const { repo, claims } = fakeHolds();
    const result = await new HoldSeats(repo, { next: () => "hold_token" }, clock, () => 10).execute({
      showId: "show-1",
      userId: "u1",
      seatIds: ["s2", "s1", "s2"],
    });

    const expiresAt = new Date("2026-01-01T20:10:00.000Z");
    expect(result).toEqual({ holdToken: "hold_token", expiresAt, seatIds: ["s2", "s1"] });
    expect(claims).toEqual([{ showId: "show-1", userId: "u1", seatIds: ["s2", "s1"], holdToken: "hold_token", expiresAt }]);
  });

  it("rejects an empty selection before touching storage", async () => {
    const { repo, claims } = fakeHolds();
    const run = new HoldSeats(repo, { next: () => "t" }, clock, () => 10).execute({ showId: "s", userId: "u", seatIds: [] });
    await expect(run).rejects.toMatchObject({ code: "NOT_FOUND", message: "Select at least one seat." });
    expect(claims).toHaveLength(0);
  });

  it("passes storage conflicts through as SeatHoldError", async () => {
    const { repo } = fakeHolds({
      claim: async () => {
        throw new SeatHoldError("Selected seats are no longer available.", "UNAVAILABLE", ["s1"]);
      },
    });
    const run = new HoldSeats(repo, { next: () => "t" }, clock, () => 10).execute({ showId: "s", userId: "u", seatIds: ["s1"] });
    await expect(run).rejects.toBeInstanceOf(SeatHoldError);
  });
});

describe("inventory and active hold reads", () => {
  it("expires stale holds before reading", async () => {
    const { repo, calls } = fakeHolds();
    const inventory = { show: { id: "show-1" }, seats: [] } as unknown as ShowInventory;
    const result = await new GetShowInventory(repo, { load: async () => (calls.push("load"), inventory) }).execute("show-1", null);
    expect(result).toBe(inventory);
    expect(calls).toEqual(["expire:show-1", "load"]);

    calls.length = 0;
    const held: HeldSeat[] = [];
    expect(await new GetActiveHold(repo).execute("show-1", "u1", "tok")).toEqual(held);
    expect(calls).toEqual(["expire:show-1", "find"]);
  });

  it("releases through the repository", async () => {
    const { repo, calls } = fakeHolds();
    await new ReleaseHold(repo).execute({ showId: "show-1", userId: "u1", holdToken: "tok" });
    expect(calls).toEqual(["release:show-1:tok"]);
  });
});
