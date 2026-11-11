"use client";

import { useCallback, useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { useShowChrome } from "@/components/use-show-chrome";

const STORAGE_KEY = "meridian.panelHeight";
const MIN_H = 118;

/**
 * Bottom panel that slides DOWN into view when it opens (keyframe-driven, so
 * the entrance animation is deterministic even when the element mounts in the
 * same React commit), and can be RESIZED by dragging its top handle.
 *
 * - Entrance/exit: transform/opacity keyframes (GPU compositor only).
 * - Resize: pointer drag writes the height straight to the DOM (rAF-batched,
 *   zero React renders while dragging), then springs + snaps to a preset on
 *   release and persists the choice in localStorage.
 * - Keyboard: focus the handle and use ArrowUp/ArrowDown/Home/End.
 */
export function SlideDownPanel({
  open,
  children,
  className,
  ariaLabel,
}: {
  open: boolean;
  children: ReactNode;
  className?: string;
  ariaLabel?: string;
}) {
  const [phase, setPhase] = useState<"closed" | "opening" | "closing">("closed");
  const frameRef = useRef<HTMLDivElement>(null);
  const raf = useRef(0);
  const sheet = useShowChrome().selectionSheet;

  // null -> the safe sheet height until the first resize or a saved value.
  const [height, setHeight] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);
  const drag = useRef({ active: false, startY: 0, startH: 0 });

  const maxH = useCallback(() => sheet.height, [sheet.height]);
  const presets = useCallback(
    () => [MIN_H, Math.round(maxH() * 0.8), maxH()],
    [maxH],
  );

  // Restore the saved height once mounted.
  useEffect(() => {
    const saved = Number(window.localStorage.getItem(STORAGE_KEY));
    if (saved >= MIN_H) setHeight(Math.min(saved, sheet.height));
  }, [sheet.height]);

  const applyHeight = useCallback(
    (h: number, save = false) => {
      const clamped = Math.max(MIN_H, Math.min(Math.round(h), maxH()));
      setHeight(clamped);
      if (save) {
        try {
          window.localStorage.setItem(STORAGE_KEY, String(clamped));
        } catch {
          /* storage unavailable */
        }
      }
      return clamped;
    },
    [maxH],
  );

  // Entrance/exit phase machine (existing keyframe behaviour).
  useEffect(() => {
    if (open) setPhase("opening");
    else if (phase === "opening") setPhase("closing");
  }, [open, phase]);

  const onAnimEnd = () => {
    if (phase === "closing") setPhase("closed");
  };

  // ---- Resize drag (pointer events; rAF-batched writes, no React renders) ----
  const placeFrame = (el: HTMLDivElement, h: number) => {
    const clamped = Math.max(MIN_H, Math.min(h, maxH()));
    el.style.height = `${clamped}px`;
    el.style.top = `${sheet.y + (sheet.height - clamped)}px`;
  };

  const onHandlePointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    const el = frameRef.current;
    if (!el) return;
    drag.current = { active: true, startY: e.clientY, startH: el.getBoundingClientRect().height };
    el.style.transition = "none";
    setDragging(true);
    document.body.classList.add("panel-resizing");
    e.currentTarget.setPointerCapture(e.pointerId);
    e.preventDefault();
  };

  const onHandlePointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d.active) return;
    const targetH = d.startH + (d.startY - e.clientY); // drag up = grow
    if (raf.current) cancelAnimationFrame(raf.current);
    raf.current = requestAnimationFrame(() => {
      raf.current = 0;
      const el = frameRef.current;
      if (!el) return;
      placeFrame(el, targetH);
    });
  };

  const endDrag = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d.active) return;
    d.active = false;
    if (raf.current) {
      cancelAnimationFrame(raf.current);
      raf.current = 0;
    }
    const el = frameRef.current;
    const current = el ? Math.round(el.getBoundingClientRect().height) : sheet.height;
    // Snap to the nearest preset, then let React own the box again.
    const snaps = presets();
    const snapped = snaps.reduce((a, b) => (Math.abs(b - current) < Math.abs(a - current) ? b : a), snaps[0] ?? current);
    if (el) {
      el.style.transition = "";
      el.style.height = "";
      el.style.top = "";
    }
    applyHeight(snapped, true);
    setDragging(false);
    document.body.classList.remove("panel-resizing");
    e.currentTarget.releasePointerCapture?.(e.pointerId);
  };

  // Keyboard resize (a11y parity with the drag handle).
  const onHandleKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    const current = height ?? sheet.height;
    const step = e.shiftKey ? 64 : 28;
    if (e.key === "ArrowUp") {
      e.preventDefault();
      applyHeight(current + step, true);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      applyHeight(current - step, true);
    } else if (e.key === "Home") {
      e.preventDefault();
      applyHeight(MIN_H, true);
    } else if (e.key === "End") {
      e.preventDefault();
      applyHeight(maxH(), true);
    }
  };

  if (phase === "closed") return null;

  return (
    <div
      ref={frameRef}
      data-chrome="sheet"
      className={cn("pointer-events-none absolute z-20 overflow-hidden", className)}
      style={{
        left: sheet.x,
        width: sheet.width,
        height: height ?? sheet.height,
        top: sheet.y + (sheet.height - (height ?? sheet.height)),
      }}
      aria-label={ariaLabel}
    >
      <div
        onAnimationEnd={onAnimEnd}
        data-resizing={dragging ? "true" : "false"}
        data-size={height != null && height <= MIN_H + 8 ? "compact" : "cozy"}
        style={{ height: "100%" }}
        className={cn(
          "panel-card pointer-events-auto flex min-h-0 flex-col overflow-hidden rounded-2xl border border-border bg-panel/85 shadow-glow backdrop-blur-md will-change-transform",
          phase === "opening" ? "animate-slide-down" : "animate-slide-down-out",
        )}
      >
        {/* Resize handle */}
        <div
          role="separator"
          aria-orientation="horizontal"
          aria-label="Resize selection panel"
          aria-valuemin={MIN_H}
          aria-valuemax={maxH()}
          aria-valuenow={height ?? sheet.height}
          tabIndex={0}
          onPointerDown={onHandlePointerDown}
          onPointerMove={onHandlePointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onKeyDown={onHandleKeyDown}
          className="flex h-7 shrink-0 cursor-ns-resize touch-none select-none items-center justify-center outline-none focus-visible:bg-gold/10"
          title="Drag to resize the panel"
        >
          <span className="h-1 w-10 rounded-full bg-white/25 transition-colors duration-200 hover:bg-white/40" />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">{children}</div>
      </div>
    </div>
  );
}
