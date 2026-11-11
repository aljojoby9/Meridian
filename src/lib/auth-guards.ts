import { auth } from "./auth";
import { redirect } from "next/navigation";

export async function requireUser() {
  const session = await auth();
  if (!session?.user?.id) redirect("/signin");
  return session;
}

export async function requireAdmin() {
  const session = await requireUser();
  if (session.user.role !== "ADMIN" && session.user.role !== "OPERATOR") {
    redirect("/");
  }
  return session;
}

export async function getOptionalUser() {
  return auth();
}
