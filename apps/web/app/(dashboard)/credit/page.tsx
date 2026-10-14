import type { Metadata } from "next";
import { ClientOnly } from "@/components/console";
import { CreditScreen } from "@/components/credit/credit-screen";

export const metadata: Metadata = { title: "Get an advance" };

// Wallet-driven client screen: its data (balances, pool state, offers) loads in the browser, so a
// navigation here isn't expected to be instant. Opt out of Next 16 instant-navigation validation.
export const instant = false;

export default function Page() {
  // Wallet state restores before hydration, so render only on the client (no hydration mismatch).
  return (
    <ClientOnly>
      <CreditScreen />
    </ClientOnly>
  );
}
