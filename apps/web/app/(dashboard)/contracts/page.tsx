import type { Metadata } from "next";
import { ContractsScreen } from "@/components/home/contracts-screen";

export const metadata: Metadata = { title: "Contracts" };

export default function ContractsPage() {
  return <ContractsScreen />;
}
