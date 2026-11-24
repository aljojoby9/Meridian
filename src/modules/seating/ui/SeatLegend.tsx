const items = [
  { key: "available", label: "Available", className: "bg-available border-border" },
  { key: "aperture", label: "Aperture", className: "bg-aperture border-aperture" },
  { key: "selected", label: "Selected", className: "bg-selected border-gold" },
  { key: "held", label: "Held", className: "bg-held border-[#7a6535]" },
  { key: "recliner", label: "Recliner", className: "bg-recliner border-[#35506b]" },
  { key: "taken", label: "Taken", className: "bg-taken border-[#5a3348]" },
] as const;

export function SeatLegend() {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-2 text-xs text-muted" aria-label="Seat legend">
      {items.map((item) => (
        <div key={item.key} className="flex items-center gap-2">
          <span className={`h-3.5 w-3.5 rounded-sm border ${item.className}`} aria-hidden />
          <span>{item.label}</span>
        </div>
      ))}
    </div>
  );
}
