import { ClientOnly } from "@/components/console";
import type { Metadata } from "next";
import { ContractsScreen } from "@/components/home/contracts-screen";

export const metadata: Metadata = { title: "Contracts" };

export default function ContractsPage() {
  // Wallet state is restored before hydration, so the screen renders on the client only (no mismatch).
  return (
    <ClientOnly>
      <ContractsScreen />
    </ClientOnly>
  );
}
