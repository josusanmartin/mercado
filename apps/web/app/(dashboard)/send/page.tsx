import { ClientOnly } from "@/components/console";
import type { Metadata } from "next";
import { SendScreen } from "@/components/transfer/send-screen";

export const metadata: Metadata = { title: "Send money" };

export default function SendPage() {
  // Wallet state is restored before hydration, so the screen renders on the client only (no mismatch).
  return (
    <ClientOnly>
      <SendScreen />
    </ClientOnly>
  );
}
