import { isAddress } from "viem";
import { jsonError } from "@/lib/server/http";
import { getInvestHistory } from "@/lib/server/invest/history";
import { ProtocolUnavailableError } from "@/lib/server/protocol";

// GET /api/invest/history?address=0x… → the wallet's own Invest activity + net totals from chain logs, indexed
// server-side (incremental, sequential), so browsers never burst eth_getLogs at the public RPC. Bigints as strings.
export async function GET(req: Request) {
  const address = new URL(req.url).searchParams.get("address");
  if (!address || !isAddress(address)) return jsonError(400, "address must be a 0x address", "BAD_ADDRESS");
  try {
    const h = await getInvestHistory(address);
    return Response.json(
      JSON.parse(JSON.stringify(h, (_k, v) => (typeof v === "bigint" ? v.toString() : v))),
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    if (e instanceof ProtocolUnavailableError) return jsonError(503, e.message, e.code);
    throw e;
  }
}
