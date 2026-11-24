import crypto from "crypto";
import type { Clock, IdGenerator } from "@/shared/kernel/ports";

export const systemClock: Clock = {
  now: () => new Date(),
};

export const cryptoIdGenerator: IdGenerator = {
  uuid: () => crypto.randomUUID(),
};
