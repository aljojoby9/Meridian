"use client";

import type { AperturePreference } from "@/lib/aperture";
import { cn } from "@/lib/utils";

const OPTIONS: Array<{ id: AperturePreference; label: string }> = [
  { id: "closer", label: "Closer" },
  { id: "balanced", label: "Balanced" },
  { id: "wider", label: "Wider" },
];

export function ApertureControl({
  value,
  onChange,
  canPreview,
  onPreview,
}: {
  value: AperturePreference;
  onChange: (value: AperturePreference) => void;
  canPreview: boolean;
  onPreview: () => void;
}) {
  return (
    <div className="flex items-center gap-2 rounded-xl border border-border/70 bg-black/60 px-2 py-1.5 shadow-glow backdrop-blur-md">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="shrink-0 text-[10px] font-semibold uppercase tracking-[0.18em] text-gold">Aperture</span>
          <div role="radiogroup" aria-label="How you like the picture" className="flex min-w-0 flex-1 gap-1">
            {OPTIONS.map((option) => {
              const active = value === option.id;
              return (
                <button
                  key={option.id}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => onChange(option.id)}
                  className={cn(
                    "min-w-0 flex-1 rounded-lg px-2 py-1 text-[11px] font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/60",
                    active ? "bg-gold text-black" : "text-muted hover:text-text",
                  )}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>
      <button
        type="button"
        onClick={onPreview}
        disabled={!canPreview}
        className="shrink-0 rounded-lg border border-gold/40 px-2.5 py-1 text-[11px] font-semibold text-gold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/60 disabled:cursor-not-allowed disabled:opacity-40"
      >
        Preview best
      </button>
    </div>
  );
}
