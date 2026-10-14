import { ClientOnly } from "@/components/console";
import { PageFallback } from "@/components/console/page-fallback";
import type { Metadata } from "next";
import { ContractsProof } from "@/components/contracts/contracts-proof";

export const metadata: Metadata = { title: "Contracts" };

export default function ContractsPage() {
  // Wallet state is restored before hydration, so the screen renders on the client only (no mismatch).
  return (
    <ClientOnly fallback={<PageFallback product="home" title="Every contract, verified." purpose="Mercado's contracts on Tempo testnet, each source-verified, with what its admin can and cannot do." />}>
      <ContractsProof />
    </ClientOnly>
  );
}
