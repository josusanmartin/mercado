import type { Metadata } from "next";
import { ClientOnly } from "@/components/console";
import { PageFallback } from "@/components/console/page-fallback";
import { CreditoScreen } from "@/components/credito/credito-screen";

export const metadata: Metadata = { title: "Mercado Crédito" };

// Wallet-driven client screens whose data loads in the browser: not expected to be instant.
export const instant = false;

// v6 CLS (lead 09:43): below 640px the driver tab (the default) IS the page, a full-screen phone app, and
// editorial.css lays it out from the shell's first paint. The back office is not a phone: this inline script
// (run while the HTML is parsed; no server searchParams read, so the route stays cacheable) marks <html> for it
// before paint. Legacy ?tab=lenders|api land there too. CreditoScreen keeps the marker in sync after hydration.
const PHONE_OFF = `if(/[?&]tab=(backoffice|lenders|api)(&|$)/.test(location.search))document.documentElement.setAttribute("data-phone-off","")`;

export default function CreditoPage() {
  // Wallet state restores before hydration, so render only on the client (no hydration mismatch).
  // The script sits in the server-only fallback: it runs while the HTML is parsed, and a client-side navigation
  // (already hydrated, no fallback) never renders a <script> (React would warn); CreditoScreen sets it then.
  return (
    <ClientOnly
      fallback={
        <>
          <script dangerouslySetInnerHTML={{ __html: PHONE_OFF }} />
          <PageFallback product="credito" />
        </>
      }
    >
      <CreditoScreen />
    </ClientOnly>
  );
}
