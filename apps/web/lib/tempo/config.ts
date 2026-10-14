// wagmi config for Tempo Moderato. Only the injected connector lives in the config. Tempo Wallet,
// Passkey and the demo personas are all `accounts`-provider connectors that share one session store;
// kept idle in the config they hijack each other's sessions (a persona's address reappears under
// Tempo Wallet a few seconds after connecting, and its writes open the tempo.xyz dialog). So they're
// created on demand when chosen (components/wallet), and personas reconnect from a remembered id.
import { createConfig, createStorage, injected } from "wagmi";
import { tempoModerato } from "@mercado/shared";
import { directTransport, sponsoredTransport } from "@/lib/contracts/sponsor";

/**
 * The Tempo connectors' `accounts` provider would otherwise wrap global fetch with an mppx polyfill,
 * auto-paying ANY 402 the app fetches with the connected wallet. Payments must only happen through the
 * explicit checkout in lib/mpp/client.ts, so turn it off for every Tempo connector.
 */
export const NO_MPP_POLYFILL = { mpp: false } as const;

/** Set NEXT_PUBLIC_FEE_SPONSOR=0 to make every account pay its own fees in AlphaUSD. */
const sponsor = process.env.NEXT_PUBLIC_FEE_SPONSOR !== "0";

export const wagmiConfig = createConfig({
  chains: [tempoModerato],
  connectors: [injected({ shimDisconnect: true })],
  transports: { [tempoModerato.id]: sponsor ? sponsoredTransport() : directTransport() },
  storage: createStorage({ storage: typeof window !== "undefined" ? window.localStorage : undefined, key: "mercado" }),
  ssr: true,
});

declare module "wagmi" {
  interface Register {
    config: typeof wagmiConfig;
  }
}
