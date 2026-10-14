import { paidCalls, type PaidProduct } from "@/lib/mpp/ledger";
import { edgeCached, jsonError } from "@/lib/server/http";

const PRODUCTS: PaidProduct[] = ["underwriting", "move-quote"];

// GET /api/mpp/calls?product=underwriting|move-quote → recent MPP-paid API calls (verified on-chain) and totals.
export async function GET(request: Request) {
  const p = new URL(request.url).searchParams.get("product") ?? undefined;
  if (p && !PRODUCTS.includes(p as PaidProduct))
    return jsonError(
      400,
      "product must be underwriting or move-quote",
      "VALIDATION",
    );
  return Response.json(paidCalls(p as PaidProduct | undefined), {
    headers: edgeCached(5),
  });
}
