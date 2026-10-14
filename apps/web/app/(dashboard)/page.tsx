import { ClientOnly } from "@/components/console";
import { HomeScreen } from "@/components/home/home-screen";

export default function HomePage() {
  // Wallet state is restored before hydration, so the screen renders on the client only (no mismatch).
  return (
    <ClientOnly>
      <HomeScreen />
    </ClientOnly>
  );
}
