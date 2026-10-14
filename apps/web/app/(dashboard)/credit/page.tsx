import type { Metadata } from "next";
import { CreditScreen } from "@/components/credit/credit-screen";

export const metadata: Metadata = { title: "Get an advance" };

export default function CreditPage() {
  return <CreditScreen />;
}
