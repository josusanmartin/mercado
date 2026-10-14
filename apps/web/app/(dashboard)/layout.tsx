import Link from "next/link";
import { TestnetBanner } from "@/components/shell/testnet-banner";
import { NetworkBadge } from "@/components/shell/network-badge";
import { MobileNav, SideNav } from "@/components/shell/nav";
import { GuillocheRosette } from "@/components/shell/guilloche";
import { WalletMenu } from "@/components/wallet/wallet-menu";
import { TourLauncher, TourPanel, TourProvider } from "@/components/tour/demo-tour";

export default function DashboardLayout({ children }: LayoutProps<"/">) {
  return (
    <TourProvider>
    <div className="flex min-h-dvh flex-col">
      <TestnetBanner />
      <header className="border-b bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/70 sticky top-0 z-30">
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-3">
          <Link href="/" className="flex items-center gap-2" aria-label="Mercado home">
            <GuillocheRosette size={30} className="text-brand" />
            <span className="font-display text-xl font-bold tracking-tight">Mercado</span>
          </Link>
          <NetworkBadge className="ml-1 hidden sm:inline-flex" />
          <div className="ml-auto flex items-center gap-2">
            <TourLauncher />
            <WalletMenu />
          </div>
        </div>
        <div className="mx-auto max-w-7xl px-4 pb-2 lg:hidden">
          <MobileNav />
        </div>
      </header>
      <div className="mx-auto grid w-full max-w-7xl flex-1 gap-8 px-4 py-6 lg:grid-cols-[13rem_1fr] lg:py-8">
        <aside className="hidden lg:block">
          <div className="sticky top-24">
            <SideNav />
          </div>
        </aside>
        <main id="main" className="min-w-0 pb-40">
          {children}
        </main>
      </div>
      <TourPanel />
    </div>
    </TourProvider>
  );
}
