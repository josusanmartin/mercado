import { DriverScoreRequestSchema } from "@mercado/shared";
import type { Address } from "viem";
import { assessDriver } from "@/lib/server/credit";
import { jsonError, parseJson } from "@/lib/server/http";

// POST /api/driver/score { borrower, profile } → deterministic demo score + signed EIP-712 Eligibility (15 min expiry).
export async function POST(request: Request) {
  const [body, err] = await parseJson(request, DriverScoreRequestSchema);
  if (err) return err;
  try {
    return Response.json(await assessDriver(body.borrower as Address, body.profile));
  } catch (e) {
    console.error("[api/driver/score]", e);
    return jsonError(500, "Scoring failed", "SCORE_FAILED");
  }
}
