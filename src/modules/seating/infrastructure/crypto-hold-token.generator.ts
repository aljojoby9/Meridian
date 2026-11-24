import crypto from "crypto";
import type { HoldTokenGenerator } from "../application/ports";

/** `hold_` + 24 random bytes, base64url encoded. */
export const cryptoHoldTokenGenerator: HoldTokenGenerator = {
  next: () => `hold_${crypto.randomBytes(24).toString("base64url")}`,
};
