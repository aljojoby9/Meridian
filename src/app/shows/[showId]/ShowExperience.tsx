"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { SeatViewModel, SeatMetrics, ShowSummary } from "@/types";
import { SeatMap } from "@/components/seat-map/SeatMap";
import { SeatViewCanvas } from "@/components/seat-view/SeatViewCanvas";
import { SelectionPanel } from "@/components/booking/SelectionPanel";
import { SlideDownPanel } from "@/components/booking/SlideDownPanel";
import { Sheet } from "@/components/booking/Sheet";
import { computeSeatMetrics } from "@/lib/metrics";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { formatMoney } from "@/lib/utils";
import { useShowChrome } from "@/components/use-show-chrome";

const MAX_HOLD_RETRIES = 3;

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
  const router = useRouter();
  const [show] = useState(initialShow);
  const [seats, setSeats] = useState(initialSeats);
  const [selectedSeatId, setSelectedSeatId] = useState<string | null>(null);
  const [holdToken, setHoldToken] = useState<string | null>(null);
  const [holdExpiresAt, setHoldExpiresAt] = useState<string | null>(null);
  const [isHolding, setIsHolding] = useState(false);
  const [isCheckingOut, setIsCheckingOut] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mapOpen, setMapOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [spatial, setSpatial] = useState(false);
  const [spatialNonce, setSpatialNonce] = useState(0);
  const spatialRef = useRef(false);
  spatialRef.current = spatial;
  const [flightPhase, setFlightPhase] = useState<"rise" | "hold" | "dive" | null>(null);

  const selectedSeat = useMemo(() => seats.find((s) => s.seatId === selectedSeatId) ?? null, [seats, selectedSeatId]);
  const metrics: SeatMetrics | null = useMemo(() => {
    if (!selectedSeat) return null;
    return computeSeatMetrics(selectedSeat, {
      screenWidthM: show.hall.screenWidthM,
      screenHeightM: show.hall.screenHeightM,
      hallDepthM: show.hall.hallDepthM,
    });
  }, [selectedSeat, show]);

  // Toast auto-dismiss
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 4200);
    return () => clearTimeout(id);
  }, [toast]);

  const refreshSeats = useCallback(async () => {
    try {
      const res = await fetch(`/api/shows/${showId}/seats`, { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      setSeats(data.seats);
      return data.seats as SeatViewModel[];
    } catch {
      // keep the current view on transient polling errors
      return undefined;
    }
  }, [showId]);

  // Real-time-ish updates: adaptive polling (fast while the user is browsing
  // a seat, calmer when idle).
  useEffect(() => {
    let interval = 4000;
    const id = setInterval(() => {
      if (document.visibilityState === "visible" && !isCheckingOut) refreshSeats();
    }, interval);
    return () => clearInterval(id);
  }, [refreshSeats, isCheckingOut]);

  const holdSeat = useCallback(
    async (seatId: string, attempt = 0): Promise<boolean> => {
      const res = await fetch(`/api/shows/${showId}/hold`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ seatIds: [seatId] }),
      });
      const data = await res.json().catch(() => ({}));

      if (res.ok) {
        setHoldToken(data.holdToken);
        setHoldExpiresAt(data.expiresAt);
        return true;
      }

      // 409 = seat was taken between render and click -> re-sync and retry once
      // on the freshest inventory (this is the common "someone beat me to it"
      // case and should not read as a hard failure).
      if (res.status === 409 && attempt < MAX_HOLD_RETRIES) {
        const fresh = await refreshSeats();
        if (!fresh) return false;
        const stillFree = fresh.find((s) => s.seatId === seatId && s.status === "AVAILABLE");
        if (!stillFree) {
          setError("That seat was just taken. Pick another one.");
          setHoldToken(null);
          setHoldExpiresAt(null);
          await refreshSeats();
          return false;
        }
        await new Promise((r) => setTimeout(r, 180 * (attempt + 1)));
        return holdSeat(seatId, attempt + 1);
      }

      if (res.status === 401) {
        router.push(`/signin?callbackUrl=/shows/${showId}`);
        return false;
      }

      setError(data.error || "Could not hold that seat. Please try another.");
      setHoldToken(null);
      setHoldExpiresAt(null);
      return false;
    },
    [showId, refreshSeats, router],
  );

  const onSelect = useCallback(
    async (seat: SeatViewModel) => {
      setError(null);
      setSelectedSeatId(seat.seatId);
      if (!isAuthenticated) {
        setToast("Sign in to hold this seat and check out.");
        return;
      }
      if (seat.status === "BOOKED" || seat.status === "BLOCKED") return;
      setIsHolding(true);
      try {
        const ok = await holdSeat(seat.seatId);
        await refreshSeats();
        if (ok) setToast(`Seat ${seat.rowLabel}${seat.number} held for 10 minutes.`);
      } finally {
        setIsHolding(false);
      }
    },
    [isAuthenticated, holdSeat, refreshSeats],
  );

  const onContinue = useCallback(async () => {
    if (!selectedSeat) return;
    if (!isAuthenticated) {
      router.push(`/signin?callbackUrl=/shows/${showId}`);
      return;
    }
    if (!holdToken) {
      // Hold was lost (expired or released) -> re-hold the same seat once.
      setError("Securing your seat…");
      const ok = await holdSeat(selectedSeat.seatId);
      if (!ok) return;
    }
    setIsCheckingOut(true);
    setError(null);
    try {
      const res = await fetch(`/api/checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ showId, holdToken }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.url) {
        setError(data.error || "Checkout could not be started");
        setIsCheckingOut(false);
        await refreshSeats();
        return;
      }
      window.location.href = data.url;
    } catch {
      setError("Network hiccup while starting checkout. Please try again.");
      setIsCheckingOut(false);
    }
  }, [selectedSeat, isAuthenticated, router, showId, holdToken, holdSeat, refreshSeats]);

  const clearSelection = useCallback(async () => {
    if (holdToken) {
      await fetch(`/api/shows/${showId}/release`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ holdToken }),
      }).catch(() => {});
    }
    setSelectedSeatId(null);
    setHoldToken(null);
    setHoldExpiresAt(null);
    await refreshSeats();
  }, [holdToken, showId, refreshSeats]);

  // VR preview. Headset and phone-tilt requests have to start inside this click,
  // before any await, or the browser drops the user activation.
  const toggleSpatial = useCallback(() => {
    const next = !spatialRef.current;
    const hooks = window as Window & {
      __meridianEnterXR?: () => void;
      __meridianExitXR?: () => void;
      __meridianVrOrient?: () => void;
    };
    if (next) {
      hooks.__meridianEnterXR?.();
      hooks.__meridianVrOrient?.();
      setSpatialNonce((n) => n + 1);
    } else {
      hooks.__meridianExitXR?.();
    }
    setSpatial(next);
  }, []);

  const hall = show.hall;
  const chrome = useShowChrome();
  const top = chrome.topControls;
  const statusBox = chrome.status;
  const sheet = chrome.selectionSheet;
  const interiorSeats = useMemo(    () =>
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

      <div
        data-chrome="top"
        className="pointer-events-auto absolute z-30 flex items-center gap-2 overflow-hidden"
        style={{ left: top.x, top: top.y, width: top.width, height: top.height }}
      >
        <Link
          href={backHref}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-border/70 bg-black/55 px-2.5 py-1 text-xs text-muted backdrop-blur transition-colors duration-200 hover:border-gold/40 hover:text-text"
        >
          <span aria-hidden>←</span> {cinemaName}
        </Link>
        <div className="min-w-0 flex-1 truncate text-sm font-semibold text-text">
          {movieTitle}
          <span className="ml-2 font-normal text-muted">
            {new Date(startsAt).toLocaleString()} · {format} · {hallName} · from {formatMoney(basePrice, currency)}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button
            variant={spatial ? "default" : "secondary"}
            size="sm"
            onClick={toggleSpatial}
            aria-label={spatial ? "Exit spatial (VR) preview" : "Enter spatial (VR) preview"}
            className="transition-transform duration-200 ease-out active:scale-[0.97]"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="mr-2 h-4 w-4"
              aria-hidden="true"
            >
              {/* VR headset */}
              <rect x="2" y="7.5" width="20" height="9.5" rx="2.6" />
              <path d="M9 17l1.6-2.1a1.8 1.8 0 0 1 2.8 0L15 17" />
              <path d="M6 7.5V5.8" />
              <path d="M18 7.5V5.8" />
            </svg>
            <span className="hidden sm:inline">{spatial ? "Exit VR" : "VR View"}</span>
            <span className="sm:hidden">{spatial ? "Exit" : "VR"}</span>
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setMapOpen(true)}
            aria-label="Open seat map"
            className="transition-transform duration-200 ease-out active:scale-[0.97]"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="mr-2 h-4 w-4"
              aria-hidden="true"
            >
              <path d="M5 11a2 2 0 0 1 2 2v2h10v-2a2 2 0 1 1 4 0v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2Z" />
              <path d="M5 11V6a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v5" />
              <path d="M6 19v2" />
              <path d="M18 19v2" />
            </svg>
            <span className="hidden sm:inline">Seat map</span>
            <span className="sm:hidden">Seats</span>
          </Button>
        </div>
      </div>

      <div
        data-chrome="status"
        className="pointer-events-none absolute z-30 flex flex-col justify-end gap-1 overflow-hidden"
        style={{ left: statusBox.x, top: statusBox.y, width: statusBox.width, height: statusBox.height }}
      >
        {spatial ? (
          <div className="pointer-events-auto inline-flex w-fit max-w-full items-center gap-2 truncate rounded-full border border-gold/40 bg-black/60 px-3 py-1 text-xs font-semibold text-gold backdrop-blur">
            <span className="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-gold" aria-hidden="true" />
            VR · drag to look
          </div>
        ) : null}
        {flightPhase ? (
          <div
            data-flight-phase={flightPhase}
            className="pointer-events-auto inline-flex w-fit max-w-full items-center gap-2 truncate rounded-full border border-white/20 bg-black/60 px-3 py-1 text-xs font-semibold text-text backdrop-blur"
          >
            {flightPhase === "rise" ? "Climbing over the hall" : flightPhase === "hold" ? "Over the hall" : "Into your seat"}
          </div>
        ) : null}
        {error ? (
          <div className="pointer-events-auto truncate rounded-xl border border-[#5a3348] bg-[#2a1520]/90 px-3 py-1.5 text-sm text-[#ffb4a8] backdrop-blur">
            {error}
          </div>
        ) : null}
        {!isAuthenticated ? (
          <div className="pointer-events-auto truncate rounded-xl border border-border bg-panel/80 px-3 py-1.5 text-sm text-muted backdrop-blur">
            Sign in to hold a seat and checkout.
          </div>
        ) : null}
        {toast ? (
          <div role="status" aria-live="polite" className="pointer-events-auto truncate rounded-xl border border-gold/30 bg-gold/10 px-3 py-1.5 text-sm text-gold backdrop-blur">
            {toast}
          </div>
        ) : null}
      </div>

      {/* Bottom panel — slides down into place when a seat is selected */}
      <SlideDownPanel open={!!selectedSeat} ariaLabel="Seat selection and checkout">
        <SelectionPanel
          seat={selectedSeat}
          metrics={metrics}
          holdExpiresAt={holdExpiresAt}
          isHolding={isHolding}
          isCheckingOut={isCheckingOut}
          onChangeSeat={clearSelection}
          onContinue={onContinue}
          onExpire={() => {
            setHoldToken(null);
            setHoldExpiresAt(null);
            setError("Your seat hold expired. Please select a seat again.");
            refreshSeats();
          }}
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
            onSelect(seat);
            setMapOpen(false);
          }}
        />
      </Sheet>
    </div>
  );
}
