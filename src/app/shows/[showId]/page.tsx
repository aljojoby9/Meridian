import { notFound } from "next/navigation";
import { auth } from "@/server/auth";
import { container } from "@/server/container";
import { toShowSummary } from "@/modules/catalog/domain/show-summary";
import ShowExperience from "@/modules/show-experience/ShowExperience";

export default async function ShowPage({ params }: { params: Promise<{ showId: string }> }) {
  const { showId } = await params;
  const session = await auth();

  const inventory = await container().seating.getShowInventory.execute(showId, session?.user?.id ?? null);
  if (!inventory) notFound();
  const { show, seats } = inventory;

  return (
    <main className="h-[100svh] w-full overflow-hidden bg-[#05070d]">
      <ShowExperience
        showId={show.id}
        isAuthenticated={!!session?.user?.id}
        initialShow={toShowSummary(show)}
        initialSeats={seats}
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
