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
// No JSON-RPC batching: measured on Moderato, the limiter counts every call inside a batch and a 429 fails the
// whole batch. Reads are already batched by wagmi's multicall (one eth_call for many contract reads).
import { createTransport, http as viemHttp, type Transport } from "viem";
import { withRelay } from "viem/tempo";
import { TEMPO_RPC_URL } from "@mercado/shared";

const MAX_INFLIGHT = 4;
const RATE_PER_SEC = 20;
const BURST = 20;
const MAX_ATTEMPTS = 6;
const SENDS = new Set(["eth_sendRawTransaction", "eth_sendRawTransactionSync", "eth_sendTransaction"]);

let inflight = 0;
let tokens = BURST;
let refilledAt = Date.now();
let pausedUntil = 0;
let timer: ReturnType<typeof setTimeout> | undefined;
const waiting: (() => void)[] = [];

function pump() {
  timer = undefined;
  const now = Date.now();
  tokens = Math.min(BURST, tokens + ((now - refilledAt) / 1000) * RATE_PER_SEC);
  refilledAt = now;
  if (now < pausedUntil) {
    timer = setTimeout(pump, pausedUntil - now);
    return;
  }
  while (waiting.length && inflight < MAX_INFLIGHT && tokens >= 1) {
    tokens -= 1;
    inflight += 1;
    waiting.shift()!();
  }
  if (waiting.length && inflight < MAX_INFLIGHT && !timer) timer = setTimeout(pump, Math.ceil(((1 - tokens) / RATE_PER_SEC) * 1000));
}

function acquire() {
  return new Promise<void>((resolve) => {
    waiting.push(resolve);
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

function isSend(body: unknown) {
  try {
    const j = JSON.parse(String(body));
    return (Array.isArray(j) ? j : [j]).some((r: { method?: string }) => SENDS.has(r?.method ?? ""));
  } catch {
    return true; // unknown body: treat as a send (no network-error retry)
  }
}

/** fetch for the public RPC: paced lane + backoff on rate limits (see RPC LANE above). */
export const pacedFetch: typeof fetch = async (input, init) => {
  const send = isSend(init?.body);
  for (let attempt = 1; ; attempt++) {
    await acquire();
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

/** JSON-RPC through the paced lane (default: our caching proxy). The timeout covers queueing and backoff. */
export const rpcTransport = (rpcUrl: string = `${origin()}/api/rpc`) =>
  viemHttp(rpcUrl, { fetchFn: pacedFetch, retryCount: 2, retryDelay: 400, timeout: 30_000 });

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
  return withRelay(rpcTransport(`${origin(base)}/api/rpc`), resilientRelay(`${origin(base)}/api/sponsor`));
}

/** Plain RPC transport (sender pays fees), same proxy + lane. */
export const directTransport = () => rpcTransport();
