import type { SeatMetrics } from "@/types";
import { seatLabel } from "@/lib/utils";

export function SeatMetricsOverlay({
  rowLabel,
  number,
  metrics,
}: {
  rowLabel: string;
  number: number;
  metrics: SeatMetrics;
}) {
  return (
    <div className="pointer-events-none h-full w-full">
      <div className="pointer-events-auto flex h-full w-full flex-col justify-center overflow-hidden rounded-2xl border border-border/80 bg-black/60 px-3 py-2 backdrop-blur-md">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] uppercase tracking-[0.2em] text-gold">Seat View</p>
            <h3 className="text-lg font-semibold">{seatLabel(rowLabel, number)}</h3>
            <p className="truncate text-xs text-muted">{metrics.description}</p>
          </div>
          <div className="animate-pulse-ring shrink-0 rounded-full border border-gold/30 bg-gold/10 px-3 py-1 text-xs font-semibold text-gold">
            {metrics.label}
          </div>
        </div>
        <div className="mt-2 grid grid-cols-3 gap-1.5 text-center">
          <Metric label="Distance" value={`${metrics.distanceM} m`} />
          <Metric label="Screen angle" value={`${metrics.horizontalFovDeg}°`} />
          <Metric
            label="Offset"
            value={metrics.offsetSide === "center" ? "Center" : `${metrics.horizontalOffsetM} m ${metrics.offsetSide}`}
          />
        </div>
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-panel/70 px-2 py-2 transition-colors duration-200 hover:bg-panel2/70">
      <div className="text-[10px] uppercase tracking-wide text-muted">{label}</div>
      <div className="mt-0.5 text-sm font-semibold text-text">{value}</div>
    </div>
  );
}
