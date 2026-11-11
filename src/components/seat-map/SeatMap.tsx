"use client";

import type { SeatViewModel } from "@/types";
import { SeatButton } from "./SeatButton";
import { SeatLegend } from "./SeatLegend";
import { useMemo } from "react";

export function SeatMap({
  seats,
  selectedSeatIds,
  onSelect,
}: {
  seats: SeatViewModel[];
  selectedSeatIds: string[];
  onSelect: (seat: SeatViewModel) => void;
}) {
  const rows = useMemo(() => {
    const map = new Map<string, SeatViewModel[]>();
    for (const seat of seats) {
      const arr = map.get(seat.rowLabel) ?? [];
      arr.push(seat);
      map.set(seat.rowLabel, arr);
    }
    return [...map.entries()]
      .map(([rowLabel, items]) => ({
        rowLabel,
        rowIndex: items[0]?.rowIndex ?? 0,
        items: items.sort((a, b) => a.colIndex - b.colIndex),
      }))
      .sort((a, b) => a.rowIndex - b.rowIndex);
  }, [seats]);

  return (
    <div className="rounded-2xl border border-border bg-panel p-4 sm:p-6">
      <div className="mb-5">
        <div className="mx-auto mb-2 h-1.5 w-[min(520px,90%)] rounded-full bg-gradient-to-r from-transparent via-[#7f8cff]/40 to-transparent" />
        <p className="text-center text-[11px] uppercase tracking-[0.25em] text-muted">Screen</p>
      </div>
      <div className="overflow-x-auto pb-2">
        <div className="stagger-children mx-auto flex min-w-max flex-col gap-2">
          {rows.map((row) => (
            <div key={row.rowLabel} className="flex items-center gap-2">
              <div className="w-5 text-center text-xs font-medium text-muted" aria-hidden>
                {row.rowLabel}
              </div>
              <div className="flex gap-1.5">
                {row.items.map((seat) => (
                  <SeatButton
                    key={seat.id}
                    seat={seat}
                    selected={selectedSeatIds.includes(seat.seatId)}
                    onSelect={onSelect}
                  />
                ))}
              </div>
              <div className="w-5 text-center text-xs font-medium text-muted" aria-hidden>
                {row.rowLabel}
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="mt-5 border-t border-border pt-4">
        <SeatLegend />
      </div>
    </div>
  );
}
