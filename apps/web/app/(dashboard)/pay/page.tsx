import type { Metadata } from "next";
import { ClientOnly } from "@/components/console";
import { PayScreen } from "@/components/billpay/pay-screen";

export const metadata: Metadata = { title: "Pay bills" };

// Wallet-driven client screen: its data (balances, pool state, offers) loads in the browser, so a
// navigation here isn't expected to be instant. Opt out of Next 16 instant-navigation validation.
export const instant = false;

export default function Page() {
  // Wallet state restores before hydration, so render only on the client (no hydration mismatch).
  return (
    <ClientOnly>
      <PayScreen />
    </ClientOnly>
  );
}
