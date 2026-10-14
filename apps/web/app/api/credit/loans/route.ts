import { loanBook } from "@/lib/server/credit";
import { edgeCached, jsonError } from "@/lib/server/http";
import { ProtocolUnavailableError } from "@/lib/server/protocol";

// GET /api/credit/loans → the active pool's loan book from Borrowed/Repaid logs: per-loan principal, fee,
// FIFO repayment status, platform (joined from the attestation that authorized it) and explorer tx.
export async function GET() {
  try {
    const book = await loanBook(25);
    return Response.json(book, { headers: edgeCached(10) });
  } catch (e) {
    if (e instanceof ProtocolUnavailableError)
      return jsonError(503, e.message, e.code);
    console.error("[api/credit/loans]", e);
    return jsonError(502, "The chain couldn't be read right now.", "RPC_ERROR");
  }
}
