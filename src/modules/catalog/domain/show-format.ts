/** Projection formats a show can run in, in display order. */
export const SHOW_FORMATS = ["TWO_D", "THREE_D", "IMAX", "DOLBY"] as const;

export type ShowFormat = (typeof SHOW_FORMATS)[number];
