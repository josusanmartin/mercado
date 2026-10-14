import { POST as quoteRoute } from "@/app/api/bills/quote/route";
import { POST as payRoute } from "@/app/api/bills/pay/route";
import { GET as orderRoute } from "@/app/api/bills/orders/[id]/route";

export const BASE = "http://localhost:3100";

export async function quote(body: Record<string, unknown>) {
  const res = await quoteRoute(
    new Request(`${BASE}/api/bills/quote`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
  );
  return { res, body: await res.json() };
}

export async function pay(body: Record<string, unknown>, authorization?: string) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (authorization) headers.Authorization = authorization;
  return payRoute(new Request(`${BASE}/api/bills/pay`, { method: "POST", headers, body: JSON.stringify(body) }));
}

export async function order(id: string) {
  const res = await orderRoute(new Request(`${BASE}/api/bills/orders/${id}`), { params: Promise.resolve({ id }) });
  return { res, body: await res.json() };
}
