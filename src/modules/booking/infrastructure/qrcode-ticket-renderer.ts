import QRCode from "qrcode";
import type { TicketQrRenderer } from "../application/ports";

export const qrcodeTicketRenderer: TicketQrRenderer = {
  toDataUrl: (payload) => QRCode.toDataURL(payload, { margin: 1, width: 220 }),
};
