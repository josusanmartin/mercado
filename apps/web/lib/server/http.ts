// Small helpers shared by the API route handlers.
import type { ZodType } from "zod";

/**
 * Headers for public, polled GET data that any visitor may share: Vercel's CDN serves it for `seconds` (then
 * stale while one request revalidates), so N idle tabs cost ~1 function invocation per window, not N
 * (crew/VERCEL.md round 2). Browsers don't keep it (max-age=0). Never use for per-user or paid responses.
 */
export const edgeCached = (seconds: number) => ({
  "Cache-Control": `public, max-age=0, s-maxage=${seconds}, stale-while-revalidate=${seconds * 4}`,
});

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
