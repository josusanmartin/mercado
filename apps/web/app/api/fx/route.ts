import { getFx } from "@/lib/server/fx";
import { jsonError } from "@/lib/server/http";
import { ProtocolUnavailableError } from "@/lib/server/protocol";

// GET /api/fx → USD/MXN from the active protocol's oracle (admin mock feed on testnet), always labeled.
export async function GET() {
  try {
    return Response.json(await getFx(), { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    if (e instanceof ProtocolUnavailableError) return jsonError(503, e.message, e.code);
    throw e;
  }
}
