import { z } from "zod";

export const checkoutSchema = z.object({
  // Seeded shows use stable ids such as "seed-show-1"; admin-created shows use cuids.
  showId: z.string().min(1).max(128),
  holdToken: z.string().min(10),
});
