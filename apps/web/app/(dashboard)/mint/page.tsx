import type { Metadata } from "next";
import { ClientOnly } from "@/components/console";
import { PageFallback } from "@/components/console/page-fallback";
import { MintDashboard } from "@/components/mint/mint-dashboard";

export const metadata: Metadata = { title: "Mercado Mint" };

export default function MintPage() {
  // Wallet state is restored before hydration, so the screen renders on the client only (no mismatch).
  return (
    <ClientOnly fallback={<PageFallback product="mint" />}>
      <MintDashboard />
    </ClientOnly>
  );
}
