"use client";

/**
 * The show page: 3D seat preview, seat map, and the hold / checkout flow.
 * State lives in the hooks; this file only composes them with the UI.
 */
import { useMemo, useState } from "react";
import type { SeatViewModel } from "@/modules/seating/domain/types";
import type { SeatMetrics } from "@/modules/seat-preview/domain/types";
import type { ShowSummary } from "@/modules/catalog/domain/show-summary";
import { computeSeatMetrics } from "@/modules/seat-preview/domain/metrics";
import { SeatViewCanvas, type FlightPhase } from "@/modules/seat-preview/ui/SeatViewCanvas";
import { SeatMap } from "@/modules/seating/ui/SeatMap";
import { SelectionPanel } from "@/modules/booking/ui/SelectionPanel";
import { Sheet } from "@/shared/ui/Sheet";
import { useShowChrome } from "@/shared/design/use-show-chrome";
import { SlideDownPanel } from "./ui/SlideDownPanel";
import { ShowTopBar } from "./ui/ShowTopBar";
import { ShowStatusStack } from "./ui/ShowStatusStack";
import { useSeatInventory, useSeatPolling } from "./hooks/use-seat-inventory";
import { useSeatBooking } from "./hooks/use-seat-booking";
import { useSpatialPreview } from "./hooks/use-spatial-preview";
import { useToast } from "./hooks/use-toast";

export default function ShowExperience({
  showId,
  initialShow,
  initialSeats,
  isAuthenticated,
  movieTitle,
  hallName,
  cinemaName,
  startsAt,
  format,
  basePrice,
  currency,
  backHref,
}: {
  showId: string;
  initialShow: ShowSummary;
  initialSeats: SeatViewModel[];
  isAuthenticated: boolean;
  movieTitle: string;
  hallName: string;
  cinemaName: string;
  startsAt: string;
  format: string;
  basePrice: number;
  currency: string;
  backHref: string;
}) {
  const [show] = useState(initialShow);
  const [mapOpen, setMapOpen] = useState(false);
  const [flightPhase, setFlightPhase] = useState<FlightPhase | null>(null);

  const { toast, setToast } = useToast();
  const { seats, refreshSeats } = useSeatInventory(showId, initialSeats);
  const booking = useSeatBooking({ showId, isAuthenticated, seats, refreshSeats, notify: setToast });
  useSeatPolling(refreshSeats, booking.isCheckingOut);
  const { spatial, spatialNonce, toggleSpatial } = useSpatialPreview();

  const { selectedSeat, selectedSeatId } = booking;
  const metrics: SeatMetrics | null = useMemo(() => {
    if (!selectedSeat) return null;
    return computeSeatMetrics(selectedSeat, {
      screenWidthM: show.hall.screenWidthM,
      screenHeightM: show.hall.screenHeightM,
      hallDepthM: show.hall.hallDepthM,
    });
  }, [selectedSeat, show]);

  const hall = show.hall;
  const chrome = useShowChrome();
  const sheet = chrome.selectionSheet;
  const interiorSeats = useMemo(
    () =>
      seats.map((s) => ({
        id: s.seatId,
        x: s.x,
        y: s.y,
        z: s.z,
        rowLabel: s.rowLabel,
        number: s.number,
        selected: s.seatId === selectedSeatId,
        taken: s.status === "BOOKED" || s.status === "BLOCKED",
      })),
    [seats, selectedSeatId],
  );

  return (
    <div className="relative h-[100svh] w-full overflow-hidden">
      <SeatViewCanvas
        screenWidthM={hall.screenWidthM}
        screenHeightM={hall.screenHeightM}
        hallDepthM={hall.hallDepthM}
        hallWidthM={hall.hallWidthM}
        seats={interiorSeats}
        selectedSeat={selectedSeat ? { x: selectedSeat.x, y: selectedSeat.y, z: selectedSeat.z } : null}
        selectedRowLabel={selectedSeat?.rowLabel}
        selectedNumber={selectedSeat?.number}
        metrics={metrics}
        spatial={spatial}
        spatialNonce={spatialNonce}
        onFlightPhase={setFlightPhase}
        posterUrl={show.movie.posterUrl}
        trailerUrl={show.movie.trailerUrl}
      />

      <ShowTopBar
        box={chrome.topControls}
        backHref={backHref}
        cinemaName={cinemaName}
        movieTitle={movieTitle}
        startsAt={startsAt}
        format={format}
        hallName={hallName}
        basePrice={basePrice}
        currency={currency}
        spatial={spatial}
        onToggleSpatial={toggleSpatial}
        onOpenMap={() => setMapOpen(true)}
      />

      <ShowStatusStack
        box={chrome.status}
        spatial={spatial}
        flightPhase={flightPhase}
        error={booking.error}
        isAuthenticated={isAuthenticated}
        toast={toast}
      />

      {/* Bottom panel — slides down into place when a seat is selected */}
      <SlideDownPanel open={!!selectedSeat} ariaLabel="Seat selection and checkout">
        <SelectionPanel
          seat={selectedSeat}
          metrics={metrics}
          holdExpiresAt={booking.holdExpiresAt}
          isHolding={booking.isHolding}
          isCheckingOut={booking.isCheckingOut}
          onChangeSeat={booking.clearSelection}
          onContinue={booking.checkout}
          onExpire={booking.onHoldExpired}
        />
      </SlideDownPanel>

      {/* Empty-state hint */}
      {!selectedSeat ? (
        <div
          data-empty-hint
          className="pointer-events-none absolute z-10 flex items-end"
          style={{ left: sheet.x, top: sheet.y, width: sheet.width, height: sheet.height }}
        >
          <div className="w-full rounded-2xl border border-border/70 bg-black/50 px-4 py-3 text-center text-sm text-muted backdrop-blur">
            Open the seat map and tap a seat to preview its exact view.
          </div>
        </div>
      ) : null}

      <Sheet
        open={mapOpen}
        onClose={() => setMapOpen(false)}
        title="Select your seat"
        description="Tap a seat to preview its exact view, distance and price."
      >
        <SeatMap
          seats={seats}
          selectedSeatIds={selectedSeatId ? [selectedSeatId] : []}
          onSelect={(seat) => {
            booking.selectSeat(seat);
            setMapOpen(false);
          }}
        />
      </Sheet>
    </div>
  );
}
