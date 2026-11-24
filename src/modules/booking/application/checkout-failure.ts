/** User-facing message and HTTP status for a failed checkout. */
export function describeCheckoutFailure(e: unknown): { message: string; status: number } {
  const message = e instanceof Error ? e.message : "Checkout failed";
  const expired = /expired|no active held seats/i.test(message);
  return {
    message: expired ? "Your seat hold expired. Please select a seat again." : message,
    status: expired ? 409 : 400,
  };
}
