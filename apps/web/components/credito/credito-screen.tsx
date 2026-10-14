"use client";
// Mercado Crédito (v2, crew/DESIGN-ECOSYSTEM.md §5): ONE product header (live pool KPIs) and ONE tab row:
//   Driver app  → web's Android-framed driver app (Uber/DiDi/Rappi demo connection → line → draw → repay)
//   Back office → the credit platform: KPIs, loan book, underwriting, lenders, Underwriting API
// The tab is synced to ?tab= and switches the Demo-mode role (Driver ↔ Lender).
import { useEffect, useState } from "react";
import { LayoutDashboard, Smartphone } from "lucide-react";
import { ListPane, SettingsLayout } from "@/components/console";
import { Badge } from "@/components/ui/badge";
import { usePool } from "@/lib/contracts";
import { fmtAmount } from "@/lib/format";
import { BackOffice } from "./back-office";
import { DriverApp } from "./driver-app";

const TABS = [
  {
    id: "driver",
    label: "Driver app",
    icon: Smartphone,
    hint: "Advances on gig income",
  },
  {
    id: "backoffice",
    label: "Back office",
    icon: LayoutDashboard,
    hint: "Loan book · lenders · API",
  },
] as const;
type Tab = (typeof TABS)[number]["id"];

function tabFromUrl(): Tab {
  const t = new URLSearchParams(window.location.search).get("tab");
  // Old deep links: ?tab=drivers → Driver app; ?tab=lenders|api → Back office.
  if (t === "lenders" || t === "api") return "backoffice";
  return TABS.some((x) => x.id === t) ? (t as Tab) : "driver";
}

const xmxn = (v: bigint | undefined, digits = 0) =>
  v === undefined ? "…" : `${fmtAmount(v, digits)} xMXN`;

export function CreditoScreen() {
  // Rendered inside ClientOnly, so window is available on first render.
  const [tab, setTab] = useState<Tab>(tabFromUrl);
  useEffect(() => {
    const url = new URL(window.location.href);
    url.searchParams.set("tab", tab);
    window.history.replaceState(null, "", url);
  }, [tab]);

  const pool = usePool();

  return (
    <SettingsLayout
      product="credito"
      title="Credit for the gig economy"
      demo={tab === "backoffice" ? "lender" : "driver"}
      purpose={
        <>
          Drivers draw small xMXN advances against their earnings, lenders fund
          the pool, and underwriters buy reports per call. Uncollateralized and
          repaid manually.
          <span className="mt-3 flex flex-wrap gap-2">
            <Badge variant="mock">Demo Uber Data</Badge>
            <Badge variant="mock">Illustrative score, not a credit model</Badge>
            <Badge variant="mock">No guaranteed return</Badge>
          </span>
        </>
      }
      kpis={[
        {
          label: "Available to lend",
          value: xmxn(pool.available),
          sub: "Idle pool cash",
        },
        {
          label: "Advances out",
          value: xmxn(pool.outstanding),
          sub: "Principal owed by drivers",
        },
        {
          label: "Fees paid to lenders",
          value: xmxn(pool.realizedFees, 2),
          sub: "From repaid advances",
        },
      ]}
      list={
        <ListPane
          label="Mercado Crédito"
          items={TABS.map((t) => ({
            id: t.id,
            label: t.label,
            icon: t.icon,
            hint: t.hint,
          }))}
          value={tab}
          onChange={(id) => setTab(id as Tab)}
        />
      }
    >
      {tab === "driver" && <DriverApp />}
      {tab === "backoffice" && <BackOffice />}
    </SettingsLayout>
  );
}
