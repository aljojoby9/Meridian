"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Modal sheet. On mobile it rises from the bottom edge; on larger screens it
 * fades/scales in from the centre. Pure transform/opacity animations.
 */
export function Sheet({
  open,
  onClose,
  title,
  description,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
}) {
  const [visible, setVisible] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      const raf = requestAnimationFrame(() => setVisible(true));
      const onKey = (e: KeyboardEvent) => {
        if (e.key === "Escape") onClose();
      };
      window.addEventListener("keydown", onKey);
      return () => {
        cancelAnimationFrame(raf);
        window.removeEventListener("keydown", onKey);
      };
    }
    setVisible(false);
  }, [open, onClose]);

  // Move focus into the sheet for keyboard users.
  useEffect(() => {
    if (open && visible) panelRef.current?.focus();
  }, [open, visible]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6">
      <button
        type="button"
        aria-label="Close seat map"
        onClick={onClose}
        className={cn(
          "absolute inset-0 bg-black/75 backdrop-blur-sm transition-opacity duration-300",
          visible ? "opacity-100" : "opacity-0",
        )}
      />
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cn(
          "relative flex max-h-[88svh] w-full max-w-4xl flex-col overflow-hidden rounded-t-2xl border border-border bg-panel shadow-glow outline-none transition-[transform,opacity] duration-[320ms] ease-[cubic-bezier(0.22,1,0.36,1)] sm:rounded-2xl",
          visible
            ? "translate-y-0 opacity-100 sm:scale-100"
            : "translate-y-[85%] opacity-0 sm:translate-y-6 sm:scale-[0.97]",
        )}
      >
        <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-3">
          <div>
            <h2 className="font-semibold">{title}</h2>
            {description ? <p className="text-xs text-muted">{description}</p> : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-border bg-panel2 px-3 py-1 text-xs text-muted transition-colors duration-200 hover:border-gold/40 hover:text-text"
          >
            Close
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-3 sm:px-4">{children}</div>
      </div>
    </div>
  );
}
