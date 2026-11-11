"use client";

import type { SeatViewModel } from "@/types";
import { formatMoney, seatLabel, cn } from "@/lib/utils";

export function SeatButton({
  seat,
  selected,
  onSelect,
}: {
  seat: SeatViewModel;
  selected: boolean;
  onSelect: (seat: SeatViewModel) => void;
}) {
  const label = seatLabel(seat.rowLabel, seat.number);
  const isTaken = seat.status === "BOOKED" || seat.status === "BLOCKED";
  const isHeldByOther = seat.status === "HELD" && !seat.heldByCurrentUser;
  const disabled = isTaken || isHeldByOther;
  const isRecliner = seat.type === "RECLINER" || seat.type === "PREMIUM";

  const statusText = selected
    ? "selected"
    : isTaken
      ? "taken"
      : isHeldByOther
        ? "temporarily held"
        : isRecliner
          ? "recliner available"
          : "available";

  return (
    <button
      type="button"
      disabled={disabled}
      aria-label={`${label}, ${statusText}, ${formatMoney(seat.price)}`}
      aria-pressed={selected}
      onClick={() => onSelect(seat)}
      className={cn(
        "h-7 w-7 rounded-md border text-[10px] font-medium tabular-nums transition-[transform,background-color,border-color,color,box-shadow] duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/60 sm:h-8 sm:w-8",
        "will-change-transform active:scale-90",
        selected && "bg-selected border-gold text-black shadow-glow",
        !selected && isTaken && "cursor-not-allowed bg-taken border-[#5a3348] text-[#8a6a7a]",
        !selected && isHeldByOther && "cursor-not-allowed bg-held border-[#7a6535] text-[#b8a070]",
        !selected &&
          !disabled &&
          isRecliner &&
          "bg-recliner border-[#35506b] text-[#b7d0ea] hover:scale-110 hover:border-[#4a7096]",
        !selected &&
          !disabled &&
          !isRecliner &&
          "bg-available border-border text-[#8f99b8] hover:scale-110 hover:border-gold/50 hover:text-text",
      )}
    >
      {seat.number}
    </button>
  );
}
