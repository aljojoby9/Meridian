import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth-guards";
import { revalidatePath } from "next/cache";
import { ShowFormat, ShowSeatStatus } from "@prisma/client";

async function createShow(formData: FormData) {
  "use server";
  await requireAdmin();
  const movieId = String(formData.get("movieId") || "");
  const hallId = String(formData.get("hallId") || "");
  const startsAt = new Date(String(formData.get("startsAt") || ""));
  const format = String(formData.get("format") || "TWO_D") as ShowFormat;
  const basePrice = Math.round(Number(formData.get("basePrice") || 0) * 100);
  if (!movieId || !hallId || Number.isNaN(startsAt.getTime()) || basePrice <= 0) return;

  const seats = await prisma.seat.findMany({ where: { hallId, isActive: true } });
  await prisma.$transaction(async (tx) => {
    const show = await tx.show.create({ data: { movieId, hallId, startsAt, format, basePrice } });
    await tx.showSeat.createMany({
      data: seats.map((seat) => ({ showId: show.id, seatId: seat.id, status: ShowSeatStatus.AVAILABLE, price: basePrice + seat.priceModifier })),
    });
  });
  revalidatePath("/admin/shows");
  revalidatePath("/");
}

export default async function AdminShowsPage() {
  await requireAdmin();
  const [shows, movies, halls] = await Promise.all([
    prisma.show.findMany({ include: { movie: true, hall: { include: { cinema: true } }, _count: { select: { bookings: true } } }, orderBy: { startsAt: "desc" }, take: 50 }),
    prisma.movie.findMany({ orderBy: { title: "asc" } }),
    prisma.hall.findMany({ include: { cinema: true }, orderBy: [{ cinema: { name: "asc" } }, { name: "asc" }] }),
  ]);

  return (
    <div className="space-y-6">
      <form action={createShow} className="grid gap-3 rounded-2xl border border-border bg-panel p-4 md:grid-cols-5">
        <select name="movieId" required className="rounded-xl border border-border bg-panel2 px-3 py-2">
          <option value="">Movie</option>
          {movies.map((m) => <option key={m.id} value={m.id}>{m.title}</option>)}
        </select>
        <select name="hallId" required className="rounded-xl border border-border bg-panel2 px-3 py-2">
          <option value="">Hall</option>
          {halls.map((h) => <option key={h.id} value={h.id}>{h.cinema.name} — {h.name}</option>)}
        </select>
        <input name="startsAt" type="datetime-local" required className="rounded-xl border border-border bg-panel2 px-3 py-2" />
        <select name="format" className="rounded-xl border border-border bg-panel2 px-3 py-2">
          {Object.values(ShowFormat).map((f) => <option key={f} value={f}>{f}</option>)}
        </select>
        <div className="flex gap-2">
          <input name="basePrice" type="number" step="0.01" min="1" placeholder="Base price" required className="w-full rounded-xl border border-border bg-panel2 px-3 py-2" />
          <button className="rounded-xl bg-gold px-4 font-medium text-black">Create</button>
        </div>
      </form>
      <div className="overflow-x-auto rounded-2xl border border-border">
        <table className="min-w-full text-sm">
          <thead className="bg-panel text-left text-muted"><tr><th className="px-4 py-3">Time</th><th className="px-4 py-3">Movie</th><th className="px-4 py-3">Hall</th><th className="px-4 py-3">Format</th><th className="px-4 py-3">Base</th><th className="px-4 py-3">Bookings</th></tr></thead>
          <tbody>
            {shows.map((s) => (
              <tr key={s.id} className="border-t border-border bg-[#0b0e14]">
                <td className="px-4 py-3">{new Date(s.startsAt).toLocaleString()}</td>
                <td className="px-4 py-3 font-medium">{s.movie.title}</td>
                <td className="px-4 py-3 text-muted">{s.hall.cinema.name} / {s.hall.name}</td>
                <td className="px-4 py-3">{s.format}</td>
                <td className="px-4 py-3">${(s.basePrice / 100).toFixed(2)}</td>
                <td className="px-4 py-3">{s._count.bookings}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
