// Caching JSON-RPC proxy for the browser (CR-08). Every tab's reads go through ONE server path instead of
// fanning out to the public Tempo RPC (429 / 403 / -32005 in devtools):
//   - identical in-flight requests are shared, and recent read results are cached for ~1–2 s
//     (immutable answers, e.g. at a fixed block or a mined receipt, for longer)
//   - upstream calls go through a small concurrency gate and retry rate limits with backoff, server-side
//   - writes and anything unknown pass straight through, uncached
import { tempoModerato } from "@mercado/shared";
import { env } from "./env";

type RpcRequest = { jsonrpc?: string; id?: number | string | null; method: string; params?: unknown[] };
type RpcResponse = { jsonrpc: "2.0"; id: number | string | null; result?: unknown; error?: { code: number; message: string; data?: unknown } };

const upstreamUrl = () => env("TEMPO_RPC_URL") ?? tempoModerato.rpcUrls.default.http[0];

// ---------------------------------------------------------------- cache policy

const isHexBlock = (t: unknown) => typeof t === "string" && /^0x[0-9a-fA-F]+$/.test(t);
const FOREVER = 3_600_000;

/** ms to cache this request's answer; 0 = never cache (pass-through). */
function ttl(method: string, params: unknown[] = [], result?: unknown): number {
  switch (method) {
    case "eth_chainId":
    case "net_version":
      return FOREVER;
    case "eth_blockNumber":
      return 1_000;
    case "eth_call":
    case "eth_getBalance":
    case "eth_getCode":
    case "eth_getStorageAt":
      return isHexBlock(params.at(-1)) ? 60_000 : 2_000; // pinned block = immutable
    case "eth_getLogs": {
      const f = (params[0] ?? {}) as { toBlock?: unknown; blockHash?: unknown };
      return f.blockHash || isHexBlock(f.toBlock) ? 60_000 : 2_000;
    }
    case "eth_getBlockByNumber":
      return isHexBlock(params[0]) ? 60_000 : 1_000;
    case "eth_getBlockByHash":
      return 60_000;
    case "eth_getTransactionReceipt":
    case "eth_getTransactionByHash":
      return result ? 600_000 : 0; // a mined tx never changes; "not yet" must be re-asked
    case "eth_gasPrice":
    case "eth_maxPriorityFeePerGas":
    case "eth_feeHistory":
      return 2_000;
    default:
      return 0; // writes, nonces (eth_getTransactionCount), fills, estimates, unknown: always live
  }
}
const cacheable = (method: string) => ttl(method, [], {}) > 0 || method === "eth_getTransactionReceipt";

// ---------------------------------------------------------------- upstream (gated, retrying)

const MAX_INFLIGHT = 6;
let inflight = 0;
const waiters: (() => void)[] = [];
async function gate<T>(fn: () => Promise<T>): Promise<T> {
  if (inflight >= MAX_INFLIGHT) await new Promise<void>((r) => waiters.push(r));
  inflight++;
  try {
    return await fn();
  } finally {
    inflight--;
    waiters.shift()?.();
  }
}

/** An explicit "not processed, slow down" answer: safe to retry even for a write. */
const isRateLimit = (status: number, body: RpcResponse | undefined) =>
  status === 429 ||
  body?.error?.code === -32005 ||
  /rate.?limit|too many/i.test(body?.error?.message ?? "");
/** Also transient for READS (edge 403 / 5xx WITHOUT a JSON-RPC answer, network): retrying a read is harmless.
 *  A 403/5xx that carries a JSON-RPC error is the node's final answer (e.g. account_getOperation →
 *  403 + -32601 "method not allowed") and is returned at once. */
const isTransient = (status: number, body: RpcResponse | undefined) =>
  isRateLimit(status, body) || !body || ((status === 403 || status >= 500) && !body.error && body.result === undefined);
/** Writes: a 5xx or dropped connection may have been processed, so never resend those. */
const WRITES = new Set(["eth_sendRawTransaction", "eth_sendRawTransactionSync", "eth_sendTransaction"]);

async function upstream(req: RpcRequest, retries: number): Promise<RpcResponse> {
  const retryable = WRITES.has(req.method) ? isRateLimit : isTransient;
  let last: RpcResponse | undefined;
  for (let attempt = 0; ; attempt++) {
    let status = 0;
    let body: RpcResponse | undefined;
    try {
      const res = await gate(() =>
        fetch(upstreamUrl(), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: req.method, params: req.params ?? [] }),
          cache: "no-store",
        }),
      );
      status = res.status;
      body = (await res.json().catch(() => undefined)) as RpcResponse | undefined;
    } catch {
      status = 599; // network error
    }
    if (body && !retryable(status, body)) return body;
    last = body;
    if (attempt >= retries || !retryable(status, body)) break;
    await new Promise((r) => setTimeout(r, 250 * 2 ** attempt + Math.random() * 150));
  }
  return last ?? { jsonrpc: "2.0", id: 1, error: { code: -32603, message: "Upstream RPC unavailable" } };
}

// ---------------------------------------------------------------- cache + dedupe

const cache = new Map<string, { exp: number; body: RpcResponse }>();
const pending = new Map<string, Promise<RpcResponse>>();

/** Drop every short-lived ("latest") read so the next poll sees post-write state. Immutable entries stay. */
function invalidateLatest() {
  for (const [k, v] of cache) if (v.exp - Date.now() <= 2_000) cache.delete(k);
}

function sweep() {
  if (cache.size < 5_000) return;
  const now = Date.now();
  for (const [k, v] of cache) if (v.exp <= now) cache.delete(k);
}

async function handle(req: RpcRequest): Promise<RpcResponse> {
  const id = req.id ?? null;
  if (typeof req?.method !== "string") return { jsonrpc: "2.0", id, error: { code: -32600, message: "Invalid request" } };
  const params = Array.isArray(req.params) ? req.params : [];
  if (!cacheable(req.method)) {
    // writes and live reads: no cache/dedupe; a write is retried ONLY on an explicit rate limit
    const r = await upstream({ method: req.method, params }, 3);
    if (WRITES.has(req.method) && !r.error) invalidateLatest(); // fresh balances right after a send
    return { ...r, jsonrpc: "2.0", id };
  }
  const key = `${req.method}:${JSON.stringify(params)}`;
  const hit = cache.get(key);
  if (hit && hit.exp > Date.now()) return { ...hit.body, jsonrpc: "2.0", id };
  let p = pending.get(key);
  if (!p) {
    p = upstream({ method: req.method, params }, 5).then((body) => {
      const ms = body.error ? Math.min(ttl(req.method, params, undefined), 1_000) : ttl(req.method, params, body.result);
      // a receipt seen mined for the first time = state just changed: drop stale "latest" reads
      if (req.method === "eth_getTransactionReceipt" && body.result) invalidateLatest();
      if (ms > 0) {
        sweep();
        cache.set(key, { exp: Date.now() + ms, body });
      }
      return body;
    });
    pending.set(key, p);
    p.finally(() => pending.delete(key));
  }
  return { ...(await p), jsonrpc: "2.0", id };
}

export async function proxyRpc(payload: unknown): Promise<RpcResponse | RpcResponse[]> {
  if (Array.isArray(payload)) {
    if (payload.length > 100) return { jsonrpc: "2.0", id: null, error: { code: -32600, message: "Batch too large" } };
    return Promise.all(payload.map((r) => handle(r as RpcRequest)));
  }
  return handle(payload as RpcRequest);
}
