// Client transport that routes Tempo transaction fills through our fee-payer relay (/api/sponsor), so
// Mercado contract calls are fee-sponsored (testnet, rate-limited) and users need no fee tokens.
//   createConfig({ chains: [tempoModerato], transports: { [tempoModerato.id]: sponsoredTransport() }, ... })
//
// FALLBACK (lead, 03:07): sponsorship must never make a transaction fail.
//   - the relay REFUSES (not allowlisted, quota exhausted, fee caps): it returns a normal unsponsored fill and the
//     wallet pays its own fee in its USD fee token (AlphaUSD)
//   - the relay is UNREACHABLE or rate-limits the IP (HTTP error): the fill is retried directly against the Tempo
//     node without feePayer, so again the wallet pays its own fee
// Every tx step records who paid (TxStep.feePaidBy, from the receipt's feePayer) so the UI can say
// "Comisión de red pagada por ti" when the user paid.
//
// RPC LANE (CR-08): browser JSON-RPC goes to api's caching proxy /api/rpc (shared in-flight requests, 1–2 s read
// cache, gated + retried upstream; writes, nonces and fills pass through uncached), through ONE paced lane per tab:
// at most 4 requests in flight, ~20 requests/s with a burst of 20, and a 429/403 (proxy, Cloudflare edge or the
// node's -32005 "rate limited") pauses the whole lane and retries the same request with backoff. A rate-limited
// request never reached the node, so retrying is safe even for sends. Network errors are retried for reads only.
// No JSON-RPC batching through the proxy: measured on Moderato, the limiter counts every call inside a batch and a 429 fails the
// whole batch. Reads are already batched by wagmi's multicall (one eth_call for many contract reads).
import { createTransport, http as viemHttp, type Transport } from "viem";
import { withRelay } from "viem/tempo";
import { TEMPO_RPC_URL } from "@mercado/shared";

// Direct mode (below) talks to the public node itself: measured 14 Oct, it answers 413 above 10 calls per batch and
// 429s once ~15-20 calls land at once from one IP (batch items count), so pace by CALLS and more gently there.
const DIRECT = process.env.NEXT_PUBLIC_RPC_DIRECT === "1";
const MAX_INFLIGHT = DIRECT ? 2 : 4;
const RATE_PER_SEC = DIRECT ? 8 : 20;
const BURST = DIRECT ? 10 : 20;
const MAX_ATTEMPTS = 6;
const SENDS = new Set(["eth_sendRawTransaction", "eth_sendRawTransactionSync", "eth_sendTransaction"]);

let inflight = 0;
let tokens = BURST;
let refilledAt = Date.now();
let pausedUntil = 0;
let timer: ReturnType<typeof setTimeout> | undefined;
const waiting: { need: number; go: () => void }[] = [];

function pump() {
  timer = undefined;
  const now = Date.now();
  tokens = Math.min(BURST, tokens + ((now - refilledAt) / 1000) * RATE_PER_SEC);
  refilledAt = now;
  if (now < pausedUntil) {
    timer = setTimeout(pump, pausedUntil - now);
    return;
  }
  while (waiting.length && inflight < MAX_INFLIGHT && tokens >= waiting[0].need) {
    tokens -= waiting[0].need;
    inflight += 1;
    waiting.shift()!.go();
  }
  if (waiting.length && inflight < MAX_INFLIGHT && !timer)
    timer = setTimeout(pump, Math.ceil(((waiting[0].need - tokens) / RATE_PER_SEC) * 1000));
}

/** Wait for a lane slot and `calls` tokens (a JSON-RPC batch spends one per call). */
function acquire(calls = 1) {
  return new Promise<void>((resolve) => {
    waiting.push({ need: Math.min(Math.max(calls, 1), BURST), go: resolve });
    pump();
  });
}

function release() {
  inflight -= 1;
  if (!timer) pump();
}

const sleep = (ms: number, signal?: AbortSignal | null) =>
  new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => (clearTimeout(t), reject(signal.reason)), { once: true });
  });

function inspect(body: unknown): { send: boolean; calls: number } {
  try {
    const j = JSON.parse(String(body));
    const list = Array.isArray(j) ? j : [j];
    return { send: list.some((r: { method?: string }) => SENDS.has(r?.method ?? "")), calls: list.length };
  } catch {
    return { send: true, calls: 1 }; // unknown body: treat as a send (no network-error retry)
  }
}

/** fetch for the public RPC: paced lane + backoff on rate limits (see RPC LANE above). */
export const pacedFetch: typeof fetch = async (input, init) => {
  const { send, calls } = inspect(init?.body);
  for (let attempt = 1; ; attempt++) {
    await acquire(calls);
    let res: Response;
    try {
      res = await fetch(input, init);
    } catch (e) {
      if (send || attempt >= 3 || init?.signal?.aborted) throw e;
      await sleep(400 * attempt, init?.signal);
      continue;
    } finally {
      release();
    }
    if ((res.status !== 429 && res.status !== 403) || attempt >= MAX_ATTEMPTS) return res;
    const text = await res.clone().text().catch(() => "");
    // a 403 carrying a JSON-RPC answer is final (Tempo: -32601 "method not allowed", e.g. account_getOperation)
    if (res.status === 403 && /"code"\s*:\s*-32601/.test(text)) return res;
    const hint = Number(text.match(/try again in (\d+)\s*ms/)?.[1] ?? 0);
    const wait = Math.max(hint, 300 * 2 ** (attempt - 1)) + Math.random() * 200;
    pausedUntil = Math.max(pausedUntil, Date.now() + wait);
    tokens = 0;
    await sleep(wait, init?.signal);
  }
};

const origin = (o?: string) => o ?? (typeof window !== "undefined" ? window.location.origin : "http://localhost:3100");

// DIRECT MODE (Vercel r2): NEXT_PUBLIC_RPC_DIRECT=1 sends browser JSON-RPC straight to the public Tempo node
// (CORS *, preflight cached 24 h) instead of /api/rpc, so reads cost no serverless invocations and each visitor
// spends its own IP's RPC budget. The proxy existed (CR-08) because the whole crew, every e2e run and the stage
// laptop shared ONE IP's limit; distributed visitors don't, but one NAT (office, venue wifi) still can, so the
// paced lane and its 429 backoff stay on, metered per call. Direct mode batches (≤5 calls/POST; the node refuses >10):
// the limiter counts each call anyway, but it saves round trips, and a 429 retries the whole batch (none of it ran).
// What's lost: the proxy's cross-tab dedupe and its "latest" invalidation after sends; tx.ts already refetches after
// receipts. Fee-sponsored fills keep going to /api/sponsor (writes only). Locally the proxy stays the default.
const browserRpcUrl = (base?: string) => (DIRECT ? TEMPO_RPC_URL : `${origin(base)}/api/rpc`);

/** JSON-RPC through the paced lane (default: our caching proxy, or the node in direct mode). The timeout covers
 *  queueing and backoff. */
export const rpcTransport = (rpcUrl: string = browserRpcUrl()) =>
  viemHttp(rpcUrl, {
    fetchFn: pacedFetch,
    retryCount: 2,
    retryDelay: 400,
    timeout: 30_000,
    batch: DIRECT && rpcUrl === TEMPO_RPC_URL ? { batchSize: 5, wait: 16 } : false,
  });

/** Relay transport that falls back to an unsponsored fill on the node when the relay itself errors. */
// The unsponsored fill fallback tries our /api/rpc proxy first, then the public node (paced lane either way).
export function resilientRelay(relayUrl: string, rpcUrl: string = TEMPO_RPC_URL): Transport {
  return (config) => {
    const relay = viemHttp(relayUrl, { retryCount: 0 })(config);
    const rpc = rpcTransport(rpcUrl)(config);
    const proxy = rpcTransport(relayUrl.replace(/\/api\/sponsor$/, "/api/rpc"))(config);
    return createTransport({
      key: "mercadoRelay",
      name: "Mercado fee relay (with direct fallback)",
      type: "http",
      request: (async ({ method, params }: { method: string; params?: unknown }) => {
        try {
          return await relay.request({ method, params } as never);
        } catch (e) {
          if (method !== "eth_fillTransaction") throw e;
          const [req, ...rest] = (params as unknown[]) ?? [];
          const unsponsored = { ...((req ?? {}) as Record<string, unknown>) };
          delete unsponsored.feePayer;
          // our gated proxy first (no public limiter on stage); the public node only if our server is down
          try {
            return await proxy.request({ method, params: [unsponsored, ...rest] } as never);
          } catch {
            return rpc.request({ method, params: [unsponsored, ...rest] } as never);
          }
        }
      }) as never,
    });
  };
}

export function sponsoredTransport(base?: string) {
  return withRelay(rpcTransport(browserRpcUrl(base)), resilientRelay(`${origin(base)}/api/sponsor`));
}

/** Plain RPC transport (sender pays fees), same lane and endpoint. */
export const directTransport = () => rpcTransport();
