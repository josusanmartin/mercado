import type { Metadata } from "next";
import { ClientOnly } from "@/components/console";
import { DevelopersScreen } from "@/components/developers/developers-screen";

export const metadata: Metadata = { title: "Developers" };

// Live, wallet-driven client screen (real paid calls): not expected to be instant.
export const instant = false;

export default function DevelopersPage() {
  // Wallet state restores before hydration, so render only on the client (no hydration mismatch).
  return (
    <ClientOnly>
      <DevelopersScreen />
    </ClientOnly>
  );
}
