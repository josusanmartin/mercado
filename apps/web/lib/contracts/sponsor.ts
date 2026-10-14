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
import { createTransport, http as viemHttp, type Transport } from "viem";
import { withRelay } from "viem/tempo";
import { TEMPO_RPC_URL } from "@mercado/shared";

/** Relay transport that falls back to an unsponsored fill on the node when the relay itself errors. */
export function resilientRelay(relayUrl: string, rpcUrl: string = TEMPO_RPC_URL): Transport {
  return (config) => {
    const relay = viemHttp(relayUrl, { retryCount: 0 })(config);
    const rpc = viemHttp(rpcUrl)(config);
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
          return rpc.request({ method, params: [unsponsored, ...rest] } as never);
        }
      }) as never,
    });
  };
}

export function sponsoredTransport(origin?: string) {
  const base = origin ?? (typeof window !== "undefined" ? window.location.origin : "http://localhost:3100");
  return withRelay(viemHttp(TEMPO_RPC_URL), resilientRelay(`${base}/api/sponsor`));
}

/** Plain RPC transport (sender pays fees). */
export const directTransport = () => viemHttp(TEMPO_RPC_URL);
