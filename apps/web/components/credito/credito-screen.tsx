"use client";
// Mercado Crédito: the credit platform. ONE product hero (live pool KPIs) and ONE tab row:
//   Drivers          → Demo Uber Data → score → signed advance → repay (numbered steps inside the tab)
//   Lenders          → supply / withdraw xMXN, pool stats, realized fees (contracts' Earn screen)
//   Underwriting API → third parties pay per report over MPP (HTTP 402)
// The tab is synced to ?tab= and switches the Demo-mode role (Driver ↔ Lender).
import { useEffect, useState } from "react";
import { HandCoins, Landmark, Plug } from "lucide-react";
import { ListPane, SettingsLayout } from "@/components/console";
import { Badge } from "@/components/ui/badge";
import { usePool } from "@/lib/contracts";
import { fmtAmount } from "@/lib/format";
import { CreditScreen } from "@/components/credit/credit-screen";
import { EarnScreen } from "@/components/earn/earn-screen";
import { CreditActivity } from "./credit-activity";
import { UnderwritingApi } from "./underwriting-api";

const TABS = [
  { id: "drivers", label: "Drivers", icon: HandCoins, hint: "Advances" },
  { id: "lenders", label: "Lenders", icon: Landmark, hint: "Fund the pool" },
  { id: "api", label: "Underwriting API", icon: Plug, hint: "Pay per report" },
] as const;
type Tab = (typeof TABS)[number]["id"];

function tabFromUrl(): Tab {
  const t = new URLSearchParams(window.location.search).get("tab");
  return TABS.some((x) => x.id === t) ? (t as Tab) : "drivers";
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
      demo={tab === "lenders" ? "lender" : "driver"}
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
      {tab === "drivers" && (
        <div className="grid gap-6">
          <CreditScreen />
          <CreditActivity
            title="Advances on-chain"
            description="Every advance drawn and repaid in the credit pool, read live from the chain."
          />
        </div>
      )}
      {tab === "lenders" && (
        <div className="grid gap-6">
          <EarnScreen embedded />
          <CreditActivity
            title="Pool activity"
            description="Lender supplies and withdrawals, advances and repayments, read live from the chain."
          />
        </div>
      )}
      {tab === "api" && <UnderwritingApi />}
    </SettingsLayout>
  );
}
