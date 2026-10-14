import type { Metadata } from "next";
import { ClientOnly } from "@/components/console";
import { EarnScreen } from "@/components/earn/earn-screen";

export const metadata: Metadata = { title: "Earn" };

export default function EarnPage() {
  // wallet state restores before hydration; render client-side only to avoid a mismatch
  return (
    <ClientOnly>
      <EarnScreen />
    </ClientOnly>
  );
}
