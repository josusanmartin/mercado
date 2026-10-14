import { BillPayRequestSchema } from "@mercado/shared";
import { BillError, payBill } from "@/lib/server/bills/service";
import { jsonError, parseJson } from "@/lib/server/http";

// POST /api/bills/pay { quoteId, idempotencyKey }
//   unpaid → 402 + WWW-Authenticate: Payment … (mppx Tempo charge bound to this order)
//   paid   → on-chain verified receipt, then SIMULATED fulfillment. Retries never charge or fulfill twice.
export async function POST(request: Request) {
  const [body, err] = await parseJson(request.clone(), BillPayRequestSchema);
  if (err) return err;
  try {
    const result = await payBill(request, body);
    if (result.kind === "challenge") return result.response;
    const headers = new Headers({ "Cache-Control": "private, no-store" });
    if (result.receiptHeader) headers.set("Payment-Receipt", result.receiptHeader);
    return Response.json(result.body, { headers });
  } catch (e) {
    if (e instanceof BillError) return jsonError(e.status, e.message, e.code);
    console.error("[api/bills/pay]", e);
    return jsonError(500, "Payment processing failed", "PAY_FAILED");
  }
}
