import { PrismaClient, Role, SeatType, ShowFormat, ShowSeatStatus } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

function rowLabel(index: number): string {
  return String.fromCharCode("A".charCodeAt(0) + index);
}

type HallConfig = {
  name: string;
  rows: number;
  seatsPerRow: number;
  screenWidthM: number;
  screenHeightM: number;
  hallDepthM: number;
  hallWidthM: number;
  rowSpacingM: number;
  seatSpacingM: number;
  firstRowDistanceM: number;
  eyeHeightM: number;
  reclinerRows?: number[]; // rowIndex values
  blocked?: Array<[number, number]>; // [rowIndex, colIndex]
};

async function seedHall(cinemaId: string, cfg: HallConfig) {
  const hall = await prisma.hall.upsert({
    where: { cinemaId_name: { cinemaId, name: cfg.name } },
    update: {},
    create: {
      cinemaId,
      name: cfg.name,
      rows: cfg.rows,
      seatsPerRow: cfg.seatsPerRow,
      screenWidthM: cfg.screenWidthM,
      screenHeightM: cfg.screenHeightM,
      hallDepthM: cfg.hallDepthM,
      hallWidthM: cfg.hallWidthM,
      rowSpacingM: cfg.rowSpacingM,
      seatSpacingM: cfg.seatSpacingM,
      firstRowDistanceM: cfg.firstRowDistanceM,
      eyeHeightM: cfg.eyeHeightM,
      layoutJson: { blocked: cfg.blocked ?? [], reclinerRows: cfg.reclinerRows ?? [] },
    },
  });

  // Recreate seats for deterministic seed.
  await prisma.seat.deleteMany({ where: { hallId: hall.id } });

  const seatsData = [];
  for (let r = 0; r < cfg.rows; r++) {
    for (let c = 0; c < cfg.seatsPerRow; c++) {
      const isBlocked = (cfg.blocked ?? []).some(([br, bc]) => br === r && bc === c);
      if (isBlocked) continue;
      const isRecliner = (cfg.reclinerRows ?? []).includes(r);
      const x = (c - (cfg.seatsPerRow - 1) / 2) * cfg.seatSpacingM;
      const y = cfg.eyeHeightM + (isRecliner ? 0.08 : 0);
      const z = cfg.firstRowDistanceM + r * cfg.rowSpacingM;
      seatsData.push({
        hallId: hall.id,
        rowLabel: rowLabel(r),
        rowIndex: r,
        number: c + 1,
        colIndex: c,
        type: isRecliner ? SeatType.RECLINER : SeatType.STANDARD,
        priceModifier: isRecliner ? 500 : 0,
        x,
        y,
        z,
        isActive: true,
      });
    }
  }
  await prisma.seat.createMany({ data: seatsData });
  return hall;
}

async function seedShowInventory(showId: string, hallId: string, basePrice: number) {
  const seats = await prisma.seat.findMany({ where: { hallId, isActive: true } });
  await prisma.showSeat.deleteMany({ where: { showId } });
  await prisma.showSeat.createMany({
    data: seats.map((seat, i) => ({
      showId,
      seatId: seat.id,
      status:
        // deterministic demo occupancy
        i % 17 === 0 ? ShowSeatStatus.BOOKED : i % 23 === 0 ? ShowSeatStatus.BLOCKED : ShowSeatStatus.AVAILABLE,
      price: basePrice + seat.priceModifier,
      version: 0,
    })),
  });
}

async function main() {
  const adminEmail = process.env.SEED_ADMIN_EMAIL ?? "admin@meridian.local";
  const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? "Admin123!ChangeMe";
  const userEmail = process.env.SEED_USER_EMAIL ?? "user@meridian.local";
  const userPassword = process.env.SEED_USER_PASSWORD ?? "User123!ChangeMe";

  const [adminHash, userHash] = await Promise.all([
    bcrypt.hash(adminPassword, 12),
    bcrypt.hash(userPassword, 12),
  ]);

  await prisma.user.upsert({
    where: { email: adminEmail },
    update: { role: Role.ADMIN, passwordHash: adminHash, name: "Meridian Admin" },
    create: { email: adminEmail, role: Role.ADMIN, passwordHash: adminHash, name: "Meridian Admin" },
  });
  await prisma.user.upsert({
    where: { email: userEmail },
    update: { role: Role.USER, passwordHash: userHash, name: "Demo Guest" },
    create: { email: userEmail, role: Role.USER, passwordHash: userHash, name: "Demo Guest" },
  });

  const cinema = await prisma.cinema.upsert({
    where: { slug: "meridian-downtown" },
    update: {},
    create: {
      name: "Meridian Downtown",
      slug: "meridian-downtown",
      city: "San Francisco",
      address: "100 Market Street",
      timezone: "America/Los_Angeles",
      imageUrl: "https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?w=1200&q=80",
    },
  });

  const hallA = await seedHall(cinema.id, {
    name: "Hall 1 — Signature",
    rows: 9,
    seatsPerRow: 12,
    screenWidthM: 12,
    screenHeightM: 5.2,
    hallDepthM: 18,
    hallWidthM: 15,
    rowSpacingM: 1.05,
    seatSpacingM: 0.58,
    firstRowDistanceM: 3.2,
    eyeHeightM: 1.18,
    reclinerRows: [7, 8],
    blocked: [
      [0, 5],
      [0, 6],
    ],
  });

  const hallB = await seedHall(cinema.id, {
    name: "Hall 2 — IMAX",
    rows: 10,
    seatsPerRow: 14,
    screenWidthM: 18,
    screenHeightM: 9,
    hallDepthM: 24,
    hallWidthM: 19,
    rowSpacingM: 1.15,
    seatSpacingM: 0.6,
    firstRowDistanceM: 4.5,
    eyeHeightM: 1.22,
    reclinerRows: [9],
  });

  const movies = await Promise.all([
    prisma.movie.upsert({
      where: { slug: "interstellar-voyage" },
      update: {},
      create: {
        title: "Interstellar Voyage",
        slug: "interstellar-voyage",
        synopsis: "A crew crosses the edge of known space to recover a lost signal.",
        durationMin: 142,
        rating: "PG-13",
        posterUrl: "https://images.unsplash.com/photo-1446776811953-b23d57bd21aa?w=800&q=80",
        trailerUrl: "https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4",
      },
    }),
    prisma.movie.upsert({
      where: { slug: "neon-drift" },
      update: {},
      create: {
        title: "Neon Drift",
        slug: "neon-drift",
        synopsis: "A night courier uncovers a citywide conspiracy in one relentless run.",
        durationMin: 118,
        rating: "R",
        posterUrl: "https://images.unsplash.com/photo-1517604931442-7e0c8ed2963c?w=800&q=80",
        trailerUrl: "https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4",
      },
    }),
  ]);

  const base = new Date();
  base.setHours(18, 0, 0, 0);
  const inHours = (h: number) => new Date(base.getTime() + h * 3600_000);

  const showPlans = [
    { id: "seed-show-1", movieId: movies[0].id, hallId: hallA.id, startsAt: inHours(2), format: ShowFormat.TWO_D, basePrice: 1800 },
    { id: "seed-show-2", movieId: movies[0].id, hallId: hallB.id, startsAt: inHours(5), format: ShowFormat.IMAX, basePrice: 2400 },
    { id: "seed-show-3", movieId: movies[1].id, hallId: hallA.id, startsAt: inHours(26), format: ShowFormat.TWO_D, basePrice: 1700 },
  ] as const;

  const shows = await Promise.all(
    showPlans.map((plan) =>
      prisma.show.upsert({
        where: { id: plan.id },
        update: {
          movieId: plan.movieId,
          hallId: plan.hallId,
          startsAt: plan.startsAt,
          format: plan.format,
          basePrice: plan.basePrice,
        },
        create: plan,
      }),
    ),
  );

  await Promise.all(shows.map((s) => seedShowInventory(s.id, s.hallId, s.basePrice)));

  console.log("Seed complete:", { cinema: cinema.slug, halls: [hallA.name, hallB.name], shows: shows.length });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
