import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { formatMoney } from "@/lib/utils";

export default async function CinemaPage({ params }: { params: Promise<{ cinemaId: string }> }) {
  const { cinemaId } = await params;
  const cinema = await prisma.cinema.findUnique({
    where: { id: cinemaId },
    include: {
      halls: {
        include: {
          shows: {
            where: { startsAt: { gte: new Date(Date.now() - 3600_000) } },
            include: { movie: true },
            orderBy: { startsAt: "asc" },
            take: 20,
          },
        },
      },
    },
  });
  if (!cinema) notFound();
  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <div className="mb-6">
        <Link href="/cinemas" className="text-sm text-gold hover:underline">Cinemas</Link>
        <h1 className="mt-1 text-2xl font-semibold">{cinema.name}</h1>
        <p className="text-sm text-muted">{cinema.city}{cinema.address ? ` · ${cinema.address}` : ""}</p>
      </div>
      <div className="space-y-6">
        {cinema.halls.map((hall) => (
          <section key={hall.id} className="rounded-2xl border border-border bg-panel p-5">
            <h2 className="font-semibold">{hall.name}</h2>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {hall.shows.map((show) => (
                <Link key={show.id} href={`/shows/${show.id}`} className="rounded-xl border border-border bg-panel2 p-3 hover:border-gold/30">
                  <div className="font-medium">{show.movie.title}</div>
                  <div className="text-sm text-muted">{new Date(show.startsAt).toLocaleString()} · {show.format}</div>
                  <div className="mt-1 text-sm text-gold">from {formatMoney(show.basePrice, show.currency)}</div>
                </Link>
              ))}
              {hall.shows.length === 0 && <p className="text-sm text-muted">No upcoming shows.</p>}
            </div>
          </section>
        ))}
      </div>
    </main>
  );
}
