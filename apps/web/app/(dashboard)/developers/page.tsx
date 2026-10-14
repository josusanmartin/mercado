import type { Metadata } from "next";
import { ClientOnly } from "@/components/console";
import { PageFallback } from "@/components/console/page-fallback";
import { DevelopersScreen } from "@/components/developers/developers-screen";

export const metadata: Metadata = { title: "Developers" };

// Live, wallet-driven client screen (real paid calls): not expected to be instant.
export const instant = false;

export default function DevelopersPage() {
  // Wallet state restores before hydration, so render only on the client (no hydration mismatch).
  return (
    <ClientOnly fallback={<PageFallback product="home" title="Mercado APIs over HTTP 402" purpose="Paid endpoints you call over HTTP 402: the server answers with a payment challenge, your client pays in xMXN on Tempo." />}>
      <DevelopersScreen />
    </ClientOnly>
  );
}
