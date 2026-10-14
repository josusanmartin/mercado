import { AppShell, DemoModeProvider } from "@/components/console";
import { TourPanel, TourProvider } from "@/components/tour/demo-tour";

export default function DashboardLayout({ children }: LayoutProps<"/">) {
  return (
    <DemoModeProvider>
      <TourProvider>
        <AppShell>{children}</AppShell>
        <TourPanel />
      </TourProvider>
    </DemoModeProvider>
  );
}
