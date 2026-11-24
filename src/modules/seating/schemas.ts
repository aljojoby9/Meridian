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

export type HoldSeatsInput = z.infer<typeof holdSeatsSchema>;
