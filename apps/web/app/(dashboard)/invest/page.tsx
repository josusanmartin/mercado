import type { Metadata } from "next";
import { ClientOnly } from "@/components/console";
import { PageFallback } from "@/components/console/page-fallback";
import { InvestScreen } from "@/components/invest/invest-screen";

export const metadata: Metadata = { title: "Mercado Invest" };

// Wallet-driven client screen whose data loads in the browser: not expected to be instant.
export const instant = false;

export default function InvestPage() {
  // Wallet state restores before hydration, so render only on the client (no hydration mismatch).
  return (
    <ClientOnly fallback={<PageFallback product="invest" />}>
      <InvestScreen />
    </ClientOnly>
  );
}
