/** Body of `POST /api/checkout`. */
export interface CheckoutResponse {
  ok: boolean;
  url?: string;
  error?: string;
}

/** Start checkout for a held set of seats. Network errors propagate to the caller. */
export async function requestCheckout(showId: string, holdToken: string | null) {
  const res = await fetch(`/api/checkout`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ showId, holdToken }),
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}
