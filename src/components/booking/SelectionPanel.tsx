"use client";

import type { SeatViewModel, SeatMetrics } from "@/types";
import { formatMoney, seatLabel } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { HoldTimer } from "./HoldTimer";

export function SelectionPanel({
  seat,
  metrics,
  holdExpiresAt,
  isHolding,
  isCheckingOut,
  onChangeSeat,
  onContinue,
  onExpire,
}: {
  seat: SeatViewModel | null;
  metrics: SeatMetrics | null;
  holdExpiresAt: string | null;
  isHolding: boolean;
  isCheckingOut: boolean;
  onChangeSeat: () => void;
  onContinue: () => void;
  onExpire: () => void;
}) {
  if (!seat) {
    return (
      <div className="flex h-full flex-col p-3 sm:p-4">
        <h3 className="font-semibold">Choose your seat</h3>
        <p className="panel-secondary mt-1 text-sm text-muted">
          Select a seat on the map to preview its exact screen view, distance, and price.
        </p>
      </div>
    );
  }

  const isPremium = seat.type === "RECLINER" || seat.type === "PREMIUM";

  return (
    <div className="flex h-full flex-col p-3 sm:p-4">
      <div className="flex shrink-0 items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] uppercase tracking-[0.2em] text-gold">Selected Seat</p>
          <h3 className="text-xl font-semibold tabular-nums">
            {seatLabel(seat.rowLabel, seat.number)}
            {isPremium ? (
              <span className="ml-2 rounded-full border border-[#35506b] bg-recliner px-2 py-0.5 align-middle text-[10px] font-semibold uppercase tracking-wide text-[#b7d0ea]">
                Premium
              </span>
            ) : null}
          </h3>
          <p className="panel-secondary truncate text-sm text-muted">
            {isPremium ? "Recliner / premium seating" : "Standard seating"}
            {metrics ? ` · ${metrics.label}` : ""}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <div className="text-xs text-muted">Price</div>
          <div className="text-lg font-semibold text-gold tabular-nums">{formatMoney(seat.price)}</div>
        </div>
      </div>

      {holdExpiresAt ? (
        <div className="panel-timer mt-3 shrink-0 rounded-xl border border-border bg-panel2/70 px-3 py-2">
          <HoldTimer expiresAt={holdExpiresAt} onExpire={onExpire} />
        </div>
      ) : null}

      <div className="panel-actions mt-auto flex gap-2 pt-3">
        <Button
          variant="secondary"
          className="flex-1 transition-transform duration-200 ease-out active:scale-[0.98]"
          onClick={onChangeSeat}
          disabled={isHolding || isCheckingOut}
        >
          Change seat
        </Button>
        <Button
          className="flex-1 transition-transform duration-200 ease-out active:scale-[0.98]"
          onClick={onContinue}
          disabled={isHolding || isCheckingOut}
        >
          {isHolding ? "Holding..." : isCheckingOut ? "Redirecting..." : "Continue"}
        </Button>
      </div>
      <p className="panel-note mt-2 shrink-0 text-[11px] text-muted">
        Seats are held for 10 minutes while you review and checkout.
      </p>
    </div>
  );
}
