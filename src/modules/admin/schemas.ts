import { z } from "zod";

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
