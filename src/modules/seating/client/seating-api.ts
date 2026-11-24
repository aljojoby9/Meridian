/**
 * Browser calls to the seating endpoints. Each returns the raw `Response`
 * status plus the parsed body so callers can branch on 401 / 409.
 */
import type { SeatViewModel } from "../domain/types";

const JSON_HEADERS = { "Content-Type": "application/json" };

/** Latest seat inventory, or `undefined` on any failure (polling keeps the current view). */
export async function fetchSeats(showId: string): Promise<SeatViewModel[] | undefined> {
  try {
    const res = await fetch(`/api/shows/${showId}/seats`, { cache: "no-store" });
    if (!res.ok) return undefined;
    const data = await res.json();
    return data.seats as SeatViewModel[];
  } catch {
    return undefined;
  }
}

/** Ask the server to hold seats. Network errors propagate to the caller. */
export async function requestHold(showId: string, seatIds: string[]) {
  const res = await fetch(`/api/shows/${showId}/hold`, {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify({ seatIds }),
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

/** Release a hold. Best effort: failures are ignored. */
export async function requestRelease(showId: string, holdToken: string): Promise<void> {
  await fetch(`/api/shows/${showId}/release`, {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify({ holdToken }),
  }).catch(() => {});
}
