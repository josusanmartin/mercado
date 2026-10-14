import type { Metadata } from "next";
import { ClientOnly } from "@/components/console";
import { CardScreen } from "@/components/card/card-screen";

export const metadata: Metadata = { title: "Mercado Card" };

export default function CardPage() {
  // Wallet state is restored before hydration, so the screen renders on the client only (no mismatch).
  return (
    <ClientOnly>
      <CardScreen />
    </ClientOnly>
  );
}
