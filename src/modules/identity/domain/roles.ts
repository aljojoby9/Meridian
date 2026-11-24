export type Role = "USER" | "ADMIN" | "OPERATOR";

export const DEFAULT_ROLE: Role = "USER";

/** Roles allowed into the operator console. */
export function isStaffRole(role: string | undefined | null): boolean {
  return role === "ADMIN" || role === "OPERATOR";
}
