"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { SeatViewModel } from "@/modules/seating/domain/types";
import { requestHold, requestRelease } from "@/modules/seating/client/seating-api";
import { requestCheckout } from "@/modules/booking/client/checkout-api";

const MAX_HOLD_RETRIES = 3;

/**
 * Seat selection -> hold -> checkout state for the show page.
 * The server stays the source of truth: every step re-reads the inventory.
 */
export function useSeatBooking({
  showId,
  isAuthenticated,
  seats,
  refreshSeats,
  notify,
}: {
  showId: string;
  isAuthenticated: boolean;
  seats: SeatViewModel[];
  refreshSeats: () => Promise<SeatViewModel[] | undefined>;
  notify: (message: string) => void;
}) {
  const router = useRouter();
  const [selectedSeatId, setSelectedSeatId] = useState<string | null>(null);
  const [holdToken, setHoldToken] = useState<string | null>(null);
  const [holdExpiresAt, setHoldExpiresAt] = useState<string | null>(null);
  const [isHolding, setIsHolding] = useState(false);
  const [isCheckingOut, setIsCheckingOut] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedSeat = useMemo(() => seats.find((s) => s.seatId === selectedSeatId) ?? null, [seats, selectedSeatId]);

  const clearHold = useCallback(() => {
    setHoldToken(null);
    setHoldExpiresAt(null);
  }, []);

  const holdSeat = useCallback(
    async (seatId: string, attempt = 0): Promise<boolean> => {
      const { ok, status, data } = await requestHold(showId, [seatId]);

      if (ok) {
        setHoldToken(data.holdToken);
        setHoldExpiresAt(data.expiresAt);
        return true;
      }

      // 409 = seat was taken between render and click -> re-sync and retry
      // on the freshest inventory (this is the common "someone beat me to it"
      // case and should not read as a hard failure).
      if (status === 409 && attempt < MAX_HOLD_RETRIES) {
        const fresh = await refreshSeats();
        if (!fresh) return false;
        const stillFree = fresh.find((s) => s.seatId === seatId && s.status === "AVAILABLE");
        if (!stillFree) {
          setError("That seat was just taken. Pick another one.");
          clearHold();
          await refreshSeats();
          return false;
        }
        await new Promise((r) => setTimeout(r, 180 * (attempt + 1)));
        return holdSeat(seatId, attempt + 1);
      }

      if (status === 401) {
        router.push(`/signin?callbackUrl=/shows/${showId}`);
        return false;
      }

      setError(data.error || "Could not hold that seat. Please try another.");
      clearHold();
      return false;
    },
    [showId, refreshSeats, router, clearHold],
  );

  const selectSeat = useCallback(
    async (seat: SeatViewModel) => {
      setError(null);
      setSelectedSeatId(seat.seatId);
      if (!isAuthenticated) {
        notify("Sign in to hold this seat and check out.");
        return;
      }
      if (seat.status === "BOOKED" || seat.status === "BLOCKED") return;
      setIsHolding(true);
      try {
        const ok = await holdSeat(seat.seatId);
        await refreshSeats();
        if (ok) notify(`Seat ${seat.rowLabel}${seat.number} held for 10 minutes.`);
      } finally {
        setIsHolding(false);
      }
    },
    [isAuthenticated, holdSeat, refreshSeats, notify],
  );

  const checkout = useCallback(async () => {
    if (!selectedSeat) return;
    if (!isAuthenticated) {
      router.push(`/signin?callbackUrl=/shows/${showId}`);
      return;
    }
    if (!holdToken) {
      // Hold was lost (expired or released) -> re-hold the same seat once.
      setError("Securing your seat…");
      const ok = await holdSeat(selectedSeat.seatId);
      if (!ok) return;
    }
    setIsCheckingOut(true);
    setError(null);
    try {
      const { ok, data } = await requestCheckout(showId, holdToken);
      if (!ok || !data.url) {
        setError(data.error || "Checkout could not be started");
        setIsCheckingOut(false);
        await refreshSeats();
        return;
      }
      window.location.href = data.url;
    } catch {
      setError("Network hiccup while starting checkout. Please try again.");
      setIsCheckingOut(false);
    }
  }, [selectedSeat, isAuthenticated, router, showId, holdToken, holdSeat, refreshSeats]);

  const clearSelection = useCallback(async () => {
    if (holdToken) {
      await requestRelease(showId, holdToken);
    }
    setSelectedSeatId(null);
    clearHold();
    await refreshSeats();
  }, [holdToken, showId, refreshSeats, clearHold]);

  const onHoldExpired = useCallback(() => {
    clearHold();
    setError("Your seat hold expired. Please select a seat again.");
    refreshSeats();
  }, [clearHold, refreshSeats]);

  return {
    selectedSeatId,
    selectedSeat,
    holdExpiresAt,
    isHolding,
    isCheckingOut,
    error,
    selectSeat,
    checkout,
    clearSelection,
    onHoldExpired,
  };
}
