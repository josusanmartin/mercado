import type { Metadata } from "next";
import { CreditScreen } from "@/components/credit/credit-screen";

export const metadata: Metadata = { title: "Get an advance" };

// Wallet-driven client screen: its data (balances, pool state, offers) loads in the browser, so a
// navigation here isn't expected to be instant. Opt out of Next 16 instant-navigation validation.
export const instant = false;

export default function Page() {
  return <CreditScreen />;
}
