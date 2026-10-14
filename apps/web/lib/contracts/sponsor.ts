// Client transport that routes Tempo transaction fills through our fee-payer relay (/api/sponsor), so
// Mercado contract calls are fee-sponsored (testnet, rate-limited) and users need no fee tokens.
// Other calls fall back to the sender paying fees in its USD fee token.
//   createConfig({ chains: [tempoModerato], transports: { [tempoModerato.id]: sponsoredTransport() }, ... })
import { http as viemHttp } from "viem";
import { withRelay } from "viem/tempo";
import { TEMPO_RPC_URL } from "@mercado/shared";

export function sponsoredTransport(origin?: string) {
  const base = origin ?? (typeof window !== "undefined" ? window.location.origin : "http://localhost:3100");
  return withRelay(viemHttp(TEMPO_RPC_URL), viemHttp(`${base}/api/sponsor`));
}

/** Plain RPC transport (sender pays fees). */
export const directTransport = () => viemHttp(TEMPO_RPC_URL);
