import { ClientOnly } from "@/components/console";
import type { Metadata } from "next";
import { MintScreen } from "@/components/vault/mint-screen";

export const metadata: Metadata = { title: "Create pesos" };

export default function MintPage() {
  // Wallet state is restored before hydration, so the screen renders on the client only (no mismatch).
  return (
    <ClientOnly>
      <MintScreen />
    </ClientOnly>
  );
}
