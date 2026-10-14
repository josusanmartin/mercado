import type { Metadata } from "next";
import { PayScreen } from "@/components/billpay/pay-screen";

export const metadata: Metadata = { title: "Pay bills" };

// Wallet-driven client screen: its data (balances, pool state, offers) loads in the browser, so a
// navigation here isn't expected to be instant. Opt out of Next 16 instant-navigation validation.
export const instant = false;

export default function Page() {
  return <PayScreen />;
}
