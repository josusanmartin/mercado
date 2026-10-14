import type { Metadata } from "next";
import { PayScreen } from "@/components/billpay/pay-screen";

export const metadata: Metadata = { title: "Pay bills · Mercado" };

export default function PayPage() {
  return <PayScreen />;
}
