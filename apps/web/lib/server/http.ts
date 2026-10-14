// Small helpers shared by the API route handlers.
import type { ZodType } from "zod";

export function jsonError(status: number, error: string, code?: string, details?: unknown) {
  return Response.json({ error, code, details }, { status });
}

/** Parses a JSON body with a Zod schema; returns [data, null] or [null, 400 Response]. */
export async function parseJson<T>(request: Request, schema: ZodType<T>): Promise<[T, null] | [null, Response]> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return [null, jsonError(400, "Request body must be JSON", "BAD_JSON")];
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return [null, jsonError(400, "Invalid request", "VALIDATION", parsed.error.issues)];
  return [parsed.data, null];
}
