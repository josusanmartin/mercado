import type { Metadata } from "next";
import { MintScreen } from "@/components/vault/mint-screen";

export const metadata: Metadata = { title: "Create pesos" };

export default function MintPage() {
  return <MintScreen />;
}
