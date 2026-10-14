import { proxyRpc } from "@/lib/server/rpc-proxy";

// POST /api/rpc → JSON-RPC to Tempo Moderato through the server: shared in-flight requests, short read
// caches, gated + retried upstream calls (CR-08). Browser transports point here instead of the public RPC.
export async function POST(request: Request) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }, { status: 400 });
  }
  return Response.json(await proxyRpc(payload), { headers: { "Cache-Control": "no-store" } });
}
