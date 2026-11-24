"use client";

import { useEffect, useRef, useState } from "react";

export function HoldTimer({ expiresAt, onExpire }: { expiresAt: string; onExpire?: () => void }) {
  const target = useRef(new Date(expiresAt).getTime());
  const [remaining, setRemaining] = useState<number>(() => Math.max(0, target.current - Date.now()));
  const fired = useRef(false);

  useEffect(() => {
    target.current = new Date(expiresAt).getTime();
    fired.current = false;
    setRemaining(Math.max(0, target.current - Date.now()));
  }, [expiresAt]);

  useEffect(() => {
    const tick = () => {
      const next = Math.max(0, target.current - Date.now());
      setRemaining(next);
      if (next === 0 && !fired.current) {
        fired.current = true;
        onExpire?.();
      }
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [onExpire]);

  const totalSec = Math.ceil(remaining / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  const urgent = totalSec > 0 && totalSec <= 120;

  return (
    <div className={`text-sm tabular-nums transition-colors duration-300 ${urgent ? "text-[#ffb4a8]" : "text-muted"}`} aria-live="polite">
      Seat held for{" "}
      <span className={`font-semibold ${urgent ? "text-[#ffb4a8]" : "text-text"}`}>
        {m}:{String(s).padStart(2, "0")}
      </span>
    </div>
  );
}
