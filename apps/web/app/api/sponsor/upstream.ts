// Server-side chain access for the sponsor relay and its policy reads: through api's /api/rpc gate
// (lib/server/rpc-proxy: shared in-flight requests, 6-wide upstream gate, 429/403/-32005 backoff; writes and
// eth_fillTransaction pass through uncached), so a sponsored charge on stage never meets the public limiter
// on its own (CR-08). Imported lazily so the pure policy tests don't load the server proxy.
import { custom, stringify } from "viem";

let id = 0;

export const gatedTransport = () =>
  custom({
    async request({ method, params }: { method: string; params?: unknown }) {
      // the node refuses account_* (403, -32601); answer at once instead of letting the proxy retry it as transient,
      // so viem's receipt wait falls straight back to eth_getTransactionReceipt
      if (method.startsWith("account_")) throw Object.assign(new Error(`method not allowed: ${method}`), { code: -32601 });
      const { proxyRpc } = await import("@/lib/server/rpc-proxy");
      // params encoded exactly as viem's http transport would (bigint-safe) before the proxy JSON-encodes them
      const r = (await proxyRpc({ jsonrpc: "2.0", id: ++id, method, params: JSON.parse(stringify(params ?? [])) as unknown[] })) as {
        result?: unknown;
        error?: { code: number; message: string; data?: unknown };
      };
      if (r.error) throw Object.assign(new Error(r.error.message), { code: r.error.code, data: r.error.data });
      return r.result;
    },
  });
