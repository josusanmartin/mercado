import { isAddress } from "viem";
import { borrowerHistory } from "@/lib/server/credit";
import { jsonError } from "@/lib/server/http";
import { ProtocolUnavailableError } from "@/lib/server/protocol";

// GET /api/credit/history?address=0x… → that borrower's Borrowed/Repaid events (newest first, 6dp strings, block
// timestamps), from the server-side CreditPool index the loan book uses. The driver app reads this instead of
// running eth_getLogs in the browser (CR-08).
export async function GET(req: Request) {
  const address = new URL(req.url).searchParams.get("address");
  if (!address || !isAddress(address)) return jsonError(400, "address must be a 0x address", "BAD_ADDRESS");
  try {
    return Response.json(await borrowerHistory(address), { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    if (e instanceof ProtocolUnavailableError) return jsonError(503, e.message, e.code);
    console.error("[api/credit/history]", e);
    return jsonError(502, "The chain couldn't be read right now.", "RPC_ERROR");
  }
}
