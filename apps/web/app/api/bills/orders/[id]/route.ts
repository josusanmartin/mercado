import { getOrder } from "@/lib/server/bills/service";
import { jsonError } from "@/lib/server/http";

// GET /api/bills/orders/:id → the order with its state history (id may also be the idempotencyKey).
export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const order = await getOrder(id);
  if (!order) return jsonError(404, "Order not found", "ORDER_NOT_FOUND");
  return Response.json(order, { headers: { "Cache-Control": "no-store" } });
}
