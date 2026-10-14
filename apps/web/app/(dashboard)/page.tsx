import { ClientOnly } from "@/components/console";
import { HomeFallback } from "@/components/console/page-fallback";
import { EcosystemHome } from "@/components/home/ecosystem-home";

export default function HomePage() {
  // Wallet state is restored before hydration, so the screen renders on the client only (no mismatch).
  return (
    <ClientOnly fallback={<HomeFallback />}>
      <EcosystemHome />
    </ClientOnly>
  );
}
