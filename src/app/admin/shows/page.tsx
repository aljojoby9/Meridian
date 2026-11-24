import { SHOW_FORMATS } from "@/modules/catalog/domain/show-format";
import { container } from "@/server/container";
import { requireAdmin } from "@/server/guards";
import { createShow } from "./actions";

export default async function AdminShowsPage() {
  await requireAdmin();
  const { shows, movies, halls } = await container().admin.queries.showsData();

  return (
    <div className="space-y-6">
      <form action={createShow} className="grid gap-3 rounded-2xl border border-border bg-panel p-4 md:grid-cols-5">
        <select name="movieId" required className="rounded-xl border border-border bg-panel2 px-3 py-2">
          <option value="">Movie</option>
          {movies.map((m) => <option key={m.id} value={m.id}>{m.title}</option>)}
        </select>
        <select name="hallId" required className="rounded-xl border border-border bg-panel2 px-3 py-2">
          <option value="">Hall</option>
          {halls.map((h) => <option key={h.id} value={h.id}>{h.cinemaName} — {h.name}</option>)}
        </select>
        <input name="startsAt" type="datetime-local" required className="rounded-xl border border-border bg-panel2 px-3 py-2" />
        <select name="format" className="rounded-xl border border-border bg-panel2 px-3 py-2">
          {SHOW_FORMATS.map((f) => <option key={f} value={f}>{f}</option>)}
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
                <td className="px-4 py-3 font-medium">{s.movieTitle}</td>
                <td className="px-4 py-3 text-muted">{s.cinemaName} / {s.hallName}</td>
                <td className="px-4 py-3">{s.format}</td>
                <td className="px-4 py-3">${(s.basePrice / 100).toFixed(2)}</td>
                <td className="px-4 py-3">{s.bookingCount}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
