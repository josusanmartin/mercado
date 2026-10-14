import type { Metadata } from "next";
import { ClientOnly } from "@/components/console";
import { CreditoScreen } from "@/components/credito/credito-screen";

export const metadata: Metadata = { title: "Mercado Crédito" };

// Wallet-driven client screens whose data loads in the browser: not expected to be instant.
export const instant = false;

export default function CreditoPage() {
  // Wallet state restores before hydration, so render only on the client (no hydration mismatch).
  return (
    <ClientOnly>
      <CreditoScreen />
    </ClientOnly>
  );
}
