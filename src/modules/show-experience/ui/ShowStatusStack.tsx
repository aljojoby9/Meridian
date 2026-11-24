"use client";

import type { Box } from "@/shared/design/show-visuals";
import type { FlightPhase } from "@/modules/seat-preview/ui/SeatViewCanvas";

/** VR badge, flight phase, error, sign-in hint, and toast, stacked above the picture. */
export function ShowStatusStack({
  box,
  spatial,
  flightPhase,
  error,
  isAuthenticated,
  toast,
}: {
  box: Box;
  spatial: boolean;
  flightPhase: FlightPhase | null;
  error: string | null;
  isAuthenticated: boolean;
  toast: string | null;
}) {
  return (
    <div
      data-chrome="status"
      className="pointer-events-none absolute z-30 flex flex-col justify-end gap-1 overflow-hidden"
      style={{ left: box.x, top: box.y, width: box.width, height: box.height }}
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
  );
}
