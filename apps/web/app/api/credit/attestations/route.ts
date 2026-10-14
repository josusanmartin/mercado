import { recentAttestations } from "@/lib/server/credit";
import { edgeCached, jsonError } from "@/lib/server/http";
import { ProtocolUnavailableError } from "@/lib/server/protocol";

// GET /api/credit/attestations → eligibility attestations this API signed for the active pool (newest first),
// each with `used` (CreditPool.nonceUsed on-chain; null if it couldn't be read).
export async function GET() {
  try {
    return Response.json(
      { attestations: await recentAttestations(20) },
      { headers: edgeCached(10) },
    );
  } catch (e) {
    if (e instanceof ProtocolUnavailableError)
      return jsonError(503, e.message, e.code);
    throw e;
  }
}
