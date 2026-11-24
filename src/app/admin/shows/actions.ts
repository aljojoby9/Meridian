"use server";

import { revalidatePath } from "next/cache";
import type { ShowFormat } from "@/modules/catalog/domain/show-format";
import { container } from "@/server/container";
import { requireAdmin } from "@/server/guards";

/** Server action behind the admin "Create show" form. Invalid input is ignored. */
export async function createShow(formData: FormData) {
  await requireAdmin();
  const created = await container().admin.createShow.execute({
    movieId: String(formData.get("movieId") || ""),
    hallId: String(formData.get("hallId") || ""),
    startsAt: new Date(String(formData.get("startsAt") || "")),
    format: String(formData.get("format") || "TWO_D") as ShowFormat,
    basePrice: Math.round(Number(formData.get("basePrice") || 0) * 100),
  });
  if (!created) return;
  revalidatePath("/admin/shows");
  revalidatePath("/");
}
