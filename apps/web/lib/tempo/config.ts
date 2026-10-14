// wagmi config for Tempo Moderato. Connectors, in the order the connect menu shows them:
// Tempo Wallet → Passkey → (Demo personas, connected on demand in components/wallet) → injected.
import { createConfig, createStorage, injected } from "wagmi";
import { tempoWallet, webAuthn } from "wagmi/tempo";
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
  connectors: [tempoWallet(NO_MPP_POLYFILL), webAuthn(NO_MPP_POLYFILL), injected({ shimDisconnect: true })],
  transports: { [tempoModerato.id]: sponsor ? sponsoredTransport() : directTransport() },
  storage: createStorage({ storage: typeof window !== "undefined" ? window.localStorage : undefined, key: "mercado" }),
  ssr: true,
});

declare module "wagmi" {
  interface Register {
    config: typeof wagmiConfig;
  }
}
