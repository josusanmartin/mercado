import { FxUnavailableError, getFx } from "@/lib/server/fx";
import { edgeCached, jsonError } from "@/lib/server/http";
import { ProtocolUnavailableError } from "@/lib/server/protocol";

// GET /api/fx → USD/MXN from the active protocol's oracle (admin mock feed on testnet), always labeled.
export async function GET() {
  try {
    return Response.json(await getFx(), { headers: edgeCached(15) });
  } catch (e) {
    if (e instanceof ProtocolUnavailableError || e instanceof FxUnavailableError) return jsonError(503, e.message, e.code);
    throw e;
  }
}
