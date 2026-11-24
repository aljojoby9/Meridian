import { NextResponse } from "next/server";

/** Parse a JSON request body, returning `null` for a missing or malformed body. */
export async function readJson(req: Request): Promise<unknown> {
  return req.json().catch(() => null);
}

/** `{ error }` JSON response with the given status. */
export function jsonError(error: unknown, status: number) {
  return NextResponse.json({ error }, { status });
}
