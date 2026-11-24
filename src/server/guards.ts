import { redirect } from "next/navigation";
import type { Session } from "next-auth";
import { isStaffRole } from "@/modules/identity/domain/roles";
import { auth } from "./auth";

/** Page guard: the signed-in session, or a redirect to /signin. */
export async function requireUser() {
  const session = await auth();
  if (!session?.user?.id) redirect("/signin");
  return session;
}

/** Page guard: an ADMIN or OPERATOR session, or a redirect home. */
export async function requireAdmin() {
  const session = await requireUser();
  if (!isStaffRole(session.user.role)) {
    redirect("/");
  }
  return session;
}

export async function getOptionalUser() {
  return auth();
}

/** API guard: the signed-in session, or `null` so the route can answer 401. */
export async function getApiSession(): Promise<Session | null> {
  const session = await auth();
  return session?.user?.id ? session : null;
}
