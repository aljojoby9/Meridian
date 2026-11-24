"use client";

import { useCallback, useEffect, useState } from "react";
import type { SeatViewModel } from "@/modules/seating/domain/types";
import { fetchSeats } from "@/modules/seating/client/seating-api";

const POLL_INTERVAL_MS = 4000;

/** Live seat inventory for a show, seeded from the server render. */
export function useSeatInventory(showId: string, initialSeats: SeatViewModel[]) {
  const [seats, setSeats] = useState(initialSeats);

  /** Re-read the inventory. Resolves to the fresh seats, or `undefined` on failure. */
  const refreshSeats = useCallback(async () => {
    const fresh = await fetchSeats(showId);
    if (fresh !== undefined) setSeats(fresh);
    return fresh;
  }, [showId]);

  return { seats, refreshSeats };
}

/**
 * Real-time-ish updates: poll while the tab is visible. Paused while checkout
 * is redirecting so the view does not change under the user.
 */
export function useSeatPolling(refreshSeats: () => Promise<unknown>, paused: boolean) {
  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === "visible" && !paused) refreshSeats();
    }, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [refreshSeats, paused]);
}
