import { AppShell, DemoModeProvider } from "@/components/console";
import { PresentMode } from "@/components/console/present";
import { TourPanel, TourProvider } from "@/components/tour/demo-tour";

export default function DashboardLayout({ children }: LayoutProps<"/">) {
  return (
    <DemoModeProvider>
      <PresentMode />
      <TourProvider>
        <AppShell>{children}</AppShell>
        <TourPanel />
      </TourProvider>
    </DemoModeProvider>
  );
}
