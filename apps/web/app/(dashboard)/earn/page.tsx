import type { Metadata } from "next";
import { EarnScreen } from "@/components/earn/earn-screen";

export const metadata: Metadata = { title: "Earn" };

export default function EarnPage() {
  return <EarnScreen />;
}
