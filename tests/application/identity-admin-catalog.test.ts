import { describe, expect, it } from "vitest";
import { ShowFormat as PrismaShowFormat } from "@prisma/client";
import { AuthenticateUser, type UserCredentialsRecord } from "@/modules/identity/application/authenticate-user";
import { isStaffRole } from "@/modules/identity/domain/roles";
import { CreateShow } from "@/modules/admin/application/create-show";
import type { ShowScheduler } from "@/modules/admin/application/ports";
import { occupancyPercent } from "@/modules/admin/domain/scheduling";
import { SHOW_FORMATS } from "@/modules/catalog/domain/show-format";
import { toShowSummary } from "@/modules/catalog/domain/show-summary";

describe("AuthenticateUser", () => {
  const user: UserCredentialsRecord = { id: "u1", email: "guest@example.test", name: "Guest", role: "USER", passwordHash: "hash" };
  const users = { findByEmail: async (email: string) => (email === user.email ? user : null) };
  const passwords = { verify: async (password: string, hash: string) => hash === "hash" && password === "correct-horse" };
  const auth = new AuthenticateUser(users, passwords);

  it("returns the user for valid credentials, without the hash", async () => {
    expect(await auth.execute({ email: user.email, password: "correct-horse" })).toEqual({ id: "u1", email: user.email, name: "Guest", role: "USER" });
  });

  it("returns null for malformed input, unknown users, missing hashes, and wrong passwords", async () => {
    expect(await auth.execute({ email: "not-an-email", password: "correct-horse" })).toBeNull();
    expect(await auth.execute({ email: user.email, password: "short" })).toBeNull();
    expect(await auth.execute({ email: "nobody@example.test", password: "correct-horse" })).toBeNull();
    expect(await auth.execute({ email: user.email, password: "wrong-password" })).toBeNull();
    const noHash = new AuthenticateUser({ findByEmail: async () => ({ ...user, passwordHash: null }) }, passwords);
    expect(await noHash.execute({ email: user.email, password: "correct-horse" })).toBeNull();
  });

  it("treats ADMIN and OPERATOR as staff", () => {
    expect([isStaffRole("ADMIN"), isStaffRole("OPERATOR"), isStaffRole("USER"), isStaffRole(undefined)]).toEqual([true, true, false, false]);
  });
});

describe("CreateShow", () => {
  function fakeScheduler() {
    const created: Array<{ show: unknown; inventory: unknown }> = [];
    const scheduler: ShowScheduler = {
      activeSeats: async () => [
        { id: "seat-a", priceModifier: 0 },
        { id: "seat-b", priceModifier: 350 },
      ],
      createShow: async (show, inventory) => void created.push({ show, inventory }),
    };
    return { scheduler, created };
  }
  const valid = { movieId: "m1", hallId: "h1", startsAt: new Date("2026-02-01T19:00:00Z"), format: "IMAX" as const, basePrice: 1500 };

  it("prices each active seat as base price plus its modifier", async () => {
    const { scheduler, created } = fakeScheduler();
    expect(await new CreateShow(scheduler).execute(valid)).toBe(true);
    expect(created[0]!.inventory).toEqual([
      { seatId: "seat-a", price: 1500 },
      { seatId: "seat-b", price: 1850 },
    ]);
  });

  it("ignores incomplete requests without writing", async () => {
    const { scheduler, created } = fakeScheduler();
    const useCase = new CreateShow(scheduler);
    expect(await useCase.execute({ ...valid, movieId: "" })).toBe(false);
    expect(await useCase.execute({ ...valid, hallId: "" })).toBe(false);
    expect(await useCase.execute({ ...valid, startsAt: new Date("nope") })).toBe(false);
    expect(await useCase.execute({ ...valid, basePrice: 0 })).toBe(false);
    expect(created).toEqual([]);
  });

  it("reports occupancy as a whole percentage", () => {
    expect([occupancyPercent(0, 0), occupancyPercent(1, 3), occupancyPercent(2, 3)]).toEqual([0, 33, 67]);
  });
});

describe("catalog domain", () => {
  it("lists the same show formats, in the same order, as the database enum", () => {
    expect([...SHOW_FORMATS]).toEqual(Object.values(PrismaShowFormat));
  });

  it("serialises a show summary for the client", () => {
    const summary = toShowSummary({
      id: "show-1",
      startsAt: new Date("2026-02-01T19:00:00Z"),
      format: "TWO_D",
      basePrice: 1200,
      currency: "usd",
      movie: { id: "m1", title: "Film", posterUrl: null, durationMin: 120, rating: "PG", trailerUrl: null },
      hall: { id: "h1", name: "Hall 1", screenWidthM: 12, screenHeightM: 5, hallDepthM: 18, hallWidthM: 16, cinema: { id: "c1", name: "Meridian", city: "Kochi", slug: "meridian" } },
    });
    expect(summary.startsAt).toBe("2026-02-01T19:00:00.000Z");
    expect(summary.hall).not.toHaveProperty("cinema");
    expect(summary.cinema).toEqual({ id: "c1", name: "Meridian", city: "Kochi", slug: "meridian" });
  });
});
