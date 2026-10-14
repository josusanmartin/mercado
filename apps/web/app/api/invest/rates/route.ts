import { jsonError } from "@/lib/server/http";
import { getInvestRates } from "@/lib/server/invest/rates";
import { ProtocolUnavailableError } from "@/lib/server/protocol";

// GET /api/invest/rates → Invest returns from the chain: sOUSD APR + exact accrual state (USD), the credit pool's
// realized annualized APR (MXN), and the equity index price + 24h change (Stocks; null until deployed).
export async function GET() {
  try {
    return Response.json(await getInvestRates(), { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    if (e instanceof ProtocolUnavailableError) return jsonError(503, e.message, e.code);
    throw e;
  }
}
