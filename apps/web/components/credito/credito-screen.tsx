"use client";
// Mercado Crédito (v2, crew/DESIGN-ECOSYSTEM.md §5): ONE product header whose meta line switches:
//   Driver app  → web's Android-framed driver app (Uber/DiDi/Rappi demo connection → line → draw → repay)
//   Back office → the credit platform: KPIs, loan book, underwriting, lenders, Underwriting API
// The tab is synced to ?tab= and switches the Demo-mode role (Driver ↔ Lender).
import { useEffect, useState } from "react";
import { SettingsLayout } from "@/components/console";
import { Honesty } from "@/components/console/present";
import { cn } from "@/lib/utils";
import { BackOffice } from "./back-office";
import { DriverApp } from "./driver-app";

const TABS = [
  {
    id: "driver",
    label: "Driver app",
  },
  {
    id: "backoffice",
    label: "Back office",
  },
] as const;
type Tab = (typeof TABS)[number]["id"];

function tabFromUrl(): Tab {
  const t = new URLSearchParams(window.location.search).get("tab");
  // Old deep links: ?tab=drivers → Driver app; ?tab=lenders|api → Back office.
  if (t === "lenders" || t === "api") return "backoffice";
  return TABS.some((x) => x.id === t) ? (t as Tab) : "driver";
}

export function CreditoScreen() {
  // Rendered inside ClientOnly, so window is available on first render.
  const [tab, setTab] = useState<Tab>(tabFromUrl);
  useEffect(() => {
    const url = new URL(window.location.href);
    url.searchParams.set("tab", tab);
    window.history.replaceState(null, "", url);
  }, [tab]);

  return (
    <SettingsLayout
      product="credito"
      title="Credit for the gig economy"
      demo={tab === "backoffice" ? "lender" : "driver"}
      purpose={
        <>
          Drivers draw small xMXN advances against their earnings, lenders fund
          the pool, and underwriters buy reports per call.
          <Honesty>
            {" "}
            Demo Uber Data, illustrative score, no guaranteed return.
          </Honesty>
        </>
      }
      // CR-04 fold: the Driver app / Back office switch lives in the header's meta line, not a tab row of its
      // own (that row cost 82px and pushed the driver phone past the 1440x900 fold). Same role=tab + names.
      meta={
        <span
          role="tablist"
          aria-label="Mercado Crédito"
          className="inline-flex flex-wrap items-center gap-x-3"
        >
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                "uppercase transition-opacity duration-150",
                tab === t.id
                  ? "underline decoration-2 underline-offset-4"
                  : "opacity-70 hover:opacity-100",
              )}
            >
              {t.label}
            </button>
          ))}
          <Honesty>· Testnet · no real value</Honesty>
        </span>
      }
    >
      {tab === "driver" && <DriverApp />}
      {tab === "backoffice" && <BackOffice />}
    </SettingsLayout>
  );
}
