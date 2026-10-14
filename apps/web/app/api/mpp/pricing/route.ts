import { parseUnits } from "viem";
import { PRICES } from "@/lib/mpp/pricing";
import { billPaymentToken } from "@/lib/mpp/server";
import { jsonError } from "@/lib/server/http";
import { ProtocolUnavailableError } from "@/lib/server/protocol";

// GET /api/mpp/pricing → what each MPP-paid API costs (base units of the active xMXN), as charged by the routes.
export async function GET() {
  try {
    const token = billPaymentToken();
    const out = Object.fromEntries(
      Object.entries(PRICES).map(([k, v]) => [
        k,
        {
          amount: parseUnits(v, 6).toString(),
          token: token.address,
          symbol: token.symbol,
        },
      ]),
    );
    return Response.json(out, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    if (e instanceof ProtocolUnavailableError)
      return jsonError(503, e.message, e.code);
    throw e;
  }
}
