import { HintBar, KeyboardNav, ProfileBar } from "@/components/console";
import { TourPanel, TourProvider } from "@/components/tour/demo-tour";

export default function DashboardLayout({ children }: LayoutProps<"/">) {
  return (
    <TourProvider>
      <div className="flex min-h-dvh flex-col">
        <header className="bg-background/95 supports-[backdrop-filter]:bg-background/85 sticky top-0 z-30 backdrop-blur">
          <div className="mx-auto max-w-[90rem] px-4 py-3 sm:px-8 sm:py-4">
            <ProfileBar />
          </div>
        </header>
        <main id="main" className="mx-auto w-full max-w-[90rem] min-w-0 flex-1 px-4 pt-4 pb-48 sm:px-8 sm:pt-6">
          {children}
        </main>
        <TourPanel />
        <HintBar />
        <KeyboardNav />
      </div>
    </TourProvider>
  );
}
