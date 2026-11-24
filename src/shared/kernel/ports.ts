/**
 * Ports every module may depend on. Implementations live in
 * `shared/server/system.ts`; tests pass fixed fakes instead.
 */

/** Source of the current time. */
export interface Clock {
  now(): Date;
}

/** Source of unique identifiers. */
export interface IdGenerator {
  uuid(): string;
}
