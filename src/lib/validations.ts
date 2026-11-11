import { z } from "zod";

export const holdSeatsSchema = z.object({
  seatIds: z.array(z.string().cuid()).min(1).max(8),
});

export const releaseSeatsSchema = z.object({
  holdToken: z.string().min(10).optional(),
  seatIds: z.array(z.string().cuid()).min(1).max(8).optional(),
}).refine((v) => v.holdToken || (v.seatIds && v.seatIds.length > 0), {
  message: "holdToken or seatIds is required",
});

export const checkoutSchema = z.object({
  // Seeded shows use stable ids such as "seed-show-1"; admin-created shows use cuids.
  showId: z.string().min(1).max(128),
  holdToken: z.string().min(10),
});

export const hallUpsertSchema = z.object({
  cinemaId: z.string().cuid(),
  name: z.string().min(2).max(80),
  rows: z.number().int().min(1).max(40),
  seatsPerRow: z.number().int().min(1).max(40),
  screenWidthM: z.number().positive().max(50),
  screenHeightM: z.number().positive().max(30),
  hallDepthM: z.number().positive().max(80),
  hallWidthM: z.number().positive().max(80),
  rowSpacingM: z.number().positive().max(3),
  seatSpacingM: z.number().positive().max(2),
  firstRowDistanceM: z.number().positive().max(30),
  eyeHeightM: z.number().positive().max(2.5),
});

export type HoldSeatsInput = z.infer<typeof holdSeatsSchema>;
