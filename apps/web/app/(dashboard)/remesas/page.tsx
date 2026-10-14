import type { Metadata } from "next";
import { ClientOnly } from "@/components/console";
import { RemesasScreen } from "@/components/remesas/remesas-screen";

export const metadata: Metadata = { title: "Mercado Remesas" };

export default function RemesasPage() {
  // Wallet state is restored before hydration, so the screen renders on the client only (no mismatch).
  return (
    <ClientOnly>
      <RemesasScreen />
    </ClientOnly>
  );
}
