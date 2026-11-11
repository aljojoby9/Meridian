import Link from "next/link";
import { prisma } from "@/lib/db";
import { formatMoney } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { auth } from "@/lib/auth";

export default async function HomePage() {
  const [shows, session] = await Promise.all([
    prisma.show.findMany({
      where: { startsAt: { gte: new Date(Date.now() - 2 * 3600_000) } },
      include: { movie: true, hall: { include: { cinema: true } } },
      orderBy: { startsAt: "asc" },
      take: 12,
    }),
    auth(),
  ]);

  return (
    <main>
      <header className="border-b border-border bg-black/20">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-gold shadow-[0_0_18px_rgba(214,178,94,0.6)]" />
            <span className="text-lg font-semibold tracking-wide">Meridian</span>
          </Link>
          <nav className="flex items-center gap-3 text-sm">
            <Link href="/cinemas" className="text-muted hover:text-text">Cinemas</Link>
            {session?.user ? <Link href="/bookings" className="text-muted hover:text-text">My bookings</Link> : null}
            {(session?.user?.role === "ADMIN" || session?.user?.role === "OPERATOR") ? (
              <Link href="/admin" className="text-muted hover:text-text">Admin</Link>
            ) : null}
            {session?.user ? (
              <span className="rounded-full border border-border px-3 py-1 text-muted">{session.user.email}</span>
            ) : (
              <Button asChild size="sm"><Link href="/signin">Sign in</Link></Button>
            )}
          </nav>
        </div>
      </header>
      <section className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
        <div className="mb-8 max-w-2xl">
          <p className="text-[11px] uppercase tracking-[0.25em] text-gold">Seat View Booking</p>
          <h1 className="mt-2 text-3xl font-semibold sm:text-5xl">See the exact view before you book.</h1>
          <p className="mt-3 text-muted">Pick any seat, preview its first-person perspective, compare distance and viewing angle, then hold and checkout securely.</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {shows.map((show) => (
            <Link key={show.id} href={`/shows/${show.id}`} className="group overflow-hidden rounded-2xl border border-border bg-panel transition hover:border-gold/30 hover:shadow-glow">
              <div className="h-40 bg-cover bg-center" style={{ backgroundImage: `linear-gradient(to top, rgba(7,8,11,.95), rgba(7,8,11,.1)), url(${show.movie.posterUrl ?? ""})` }} />
              <div className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h2 className="font-semibold group-hover:text-gold">{show.movie.title}</h2>
                    <p className="text-sm text-muted">{show.hall.cinema.name} · {show.hall.name}</p>
                  </div>
                  <span className="rounded-full border border-border bg-panel2 px-2 py-0.5 text-[11px] text-muted">{show.format}</span>
                </div>
                <div className="mt-3 flex items-center justify-between text-sm">
                  <span className="text-muted">{new Date(show.startsAt).toLocaleString()}</span>
                  <span className="font-medium text-gold">from {formatMoney(show.basePrice, show.currency)}</span>
                </div>
              </div>
            </Link>
          ))}
          {shows.length === 0 && (
            <div className="rounded-2xl border border-border bg-panel p-6 text-muted">No shows found. Run <code>npm run db:seed</code> after setting up the database.</div>
          )}
        </div>
      </section>
    </main>
  );
}
