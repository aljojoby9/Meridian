/** JSON encoded in each ticket's QR code (schema version 1). */
export function buildTicketQrPayload(params: {
  bookingId: string;
  confirmationCode: string;
  showId: string;
  seatLabel: string;
  ticketId: string;
}): string {
  return JSON.stringify({
    v: 1,
    bookingId: params.bookingId,
    code: params.confirmationCode,
    showId: params.showId,
    seat: params.seatLabel,
    ticketId: params.ticketId,
  });
}
