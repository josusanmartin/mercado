import { BillQuoteRequestSchema } from "@mercado/shared";
import { BillQuoteError, createQuote } from "@/lib/server/bills/service";
import { jsonError, parseJson } from "@/lib/server/http";
import { ProtocolUnavailableError } from "@/lib/server/protocol";

// POST /api/bills/quote → price a SIMULATED Telcel top-up / CFE bill, payable via MPP at /api/bills/pay.
export async function POST(request: Request) {
  const [body, err] = await parseJson(request, BillQuoteRequestSchema);
  if (err) return err;
  try {
    return Response.json(await createQuote(body));
  } catch (e) {
    if (e instanceof BillQuoteError) return jsonError(400, e.message, "QUOTE_REJECTED");
    if (e instanceof ProtocolUnavailableError) return jsonError(503, e.message, e.code);
    console.error("[api/bills/quote]", e);
    return jsonError(500, "Quote failed", "QUOTE_FAILED");
  }
}
