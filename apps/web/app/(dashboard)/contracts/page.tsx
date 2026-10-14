import { ClientOnly } from "@/components/console";
import type { Metadata } from "next";
import { ContractsProof } from "@/components/contracts/contracts-proof";

export const metadata: Metadata = { title: "Contracts" };

export default function ContractsPage() {
  // Wallet state is restored before hydration, so the screen renders on the client only (no mismatch).
  return (
    <ClientOnly>
      <ContractsProof />
    </ClientOnly>
  );
}
