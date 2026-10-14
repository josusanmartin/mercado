// wagmi config for Tempo Moderato. Connectors, in the order the connect menu shows them:
// Tempo Wallet → Passkey → (Demo personas, connected on demand in components/wallet) → injected.
import { createConfig, createStorage, injected } from "wagmi";
import { tempoWallet, webAuthn } from "wagmi/tempo";
import { tempoModerato } from "@mercado/shared";
import { directTransport, sponsoredTransport } from "@/lib/contracts/sponsor";

/** Set NEXT_PUBLIC_FEE_SPONSOR=0 to make every account pay its own fees in AlphaUSD. */
const sponsor = process.env.NEXT_PUBLIC_FEE_SPONSOR !== "0";

export const wagmiConfig = createConfig({
  chains: [tempoModerato],
  connectors: [tempoWallet(), webAuthn(), injected({ shimDisconnect: true })],
  transports: { [tempoModerato.id]: sponsor ? sponsoredTransport() : directTransport() },
  storage: createStorage({ storage: typeof window !== "undefined" ? window.localStorage : undefined, key: "mercado" }),
  ssr: true,
});

declare module "wagmi" {
  interface Register {
    config: typeof wagmiConfig;
  }
}
