import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { expireStaleHolds } from "@/lib/seat-lock";
import ShowExperience from "./ShowExperience";

export default async function ShowPage({ params }: { params: Promise<{ showId: string }> }) {
  const { showId } = await params;
  const session = await auth();
  await expireStaleHolds(showId);

  const show = await prisma.show.findUnique({
    where: { id: showId },
    include: {
      movie: true,
      hall: { include: { cinema: true } },
      showSeats: { include: { seat: true }, orderBy: [{ seat: { rowIndex: "asc" } }, { seat: { colIndex: "asc" } }] },
    },
  });
  if (!show) notFound();

  const initialSeats = show.showSeats.map((ss) => ({
    id: ss.id,
    seatId: ss.seatId,
    rowLabel: ss.seat.rowLabel,
    number: ss.seat.number,
    rowIndex: ss.seat.rowIndex,
    colIndex: ss.seat.colIndex,
    type: ss.seat.type,
    status: ss.status,
    price: ss.price,
    x: ss.seat.x,
    y: ss.seat.y,
    z: ss.seat.z,
    holdExpiresAt: ss.holdExpiresAt?.toISOString() ?? null,
    heldByCurrentUser: !!session?.user?.id && ss.heldByUserId === session.user.id,
  }));

  return (
    <main className="h-[100svh] w-full overflow-hidden bg-[#05070d]">
      <ShowExperience
        showId={show.id}
        isAuthenticated={!!session?.user?.id}
        initialShow={{
          id: show.id,
          startsAt: show.startsAt.toISOString(),
          format: show.format,
          basePrice: show.basePrice,
          currency: show.currency,
          movie: { id: show.movie.id, title: show.movie.title, posterUrl: show.movie.posterUrl, durationMin: show.movie.durationMin, rating: show.movie.rating, trailerUrl: show.movie.trailerUrl },
          hall: { id: show.hall.id, name: show.hall.name, screenWidthM: show.hall.screenWidthM, screenHeightM: show.hall.screenHeightM, hallDepthM: show.hall.hallDepthM, hallWidthM: show.hall.hallWidthM } as any,
          cinema: { id: show.hall.cinema.id, name: show.hall.cinema.name, city: show.hall.cinema.city, slug: show.hall.cinema.slug },
        } as any}
        initialSeats={initialSeats}
        movieTitle={show.movie.title}
        hallName={show.hall.name}
        cinemaName={show.hall.cinema.name}
        startsAt={show.startsAt.toISOString()}
        format={show.format}
        basePrice={show.basePrice}
        currency={show.currency}
        backHref={`/cinemas/${show.hall.cinemaId}`}
      />
    </main>
  );
}
