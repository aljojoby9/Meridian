"use client";

import Link from "next/link";
import { Button } from "@/shared/ui/button";
import { formatMoney } from "@/shared/lib/format";
import type { Box } from "@/shared/design/show-visuals";

/** Back link, show title line, and the VR / seat-map buttons. */
export function ShowTopBar({
  box,
  backHref,
  cinemaName,
  movieTitle,
  startsAt,
  format,
  hallName,
  basePrice,
  currency,
  spatial,
  onToggleSpatial,
  onOpenMap,
}: {
  box: Box;
  backHref: string;
  cinemaName: string;
  movieTitle: string;
  startsAt: string;
  format: string;
  hallName: string;
  basePrice: number;
  currency: string;
  spatial: boolean;
  onToggleSpatial: () => void;
  onOpenMap: () => void;
}) {
  return (
    <div
      data-chrome="top"
      className="pointer-events-auto absolute z-30 flex items-center gap-2 overflow-hidden"
      style={{ left: box.x, top: box.y, width: box.width, height: box.height }}
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
          onClick={onToggleSpatial}
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
          onClick={onOpenMap}
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
  );
}
