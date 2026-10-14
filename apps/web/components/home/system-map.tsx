"use client";
// The System view: Mercado as four modules around one synthetic currency (SPEC v0.2).
// Each module shows a live on-chain number; the hub is the xMXN supply all four share.
import Link from "next/link";
import { ArrowLeftRight, Coins, HandCoins, Receipt, type LucideIcon } from "lucide-react";
import { ADDR, useBalances, useThreeBuckets } from "@/lib/contracts";
import { fmtAmount } from "@/lib/format";
import { Panel } from "@/components/console";

type Module = { name: string; verb: string; href: string; icon: LucideIcon; value: string; caption: string; note: string };

const n0 = (v: bigint | undefined) => (v === undefined ? "—" : fmtAmount(v, 0));

export function SystemMap() {
  const b = useThreeBuckets();
  // MPP bill payments settle to the merchant wallet: its xMXN balance is what Spend has received.
  const merchant = useBalances(ADDR.merchant);

  const modules: Module[] = [
    {
      name: "Create",
      verb: "Mint xMXN against collateral",
      href: "/mint",
      icon: Coins,
      value: n0(b.vault.collateralOusd),
      caption: "OUSD locked as collateral",
      note: "Institutions lock collateral that keeps its own yield",
    },
    {
      name: "Move",
      verb: "Send money across borders",
      href: "/send",
      icon: ArrowLeftRight,
      value: n0(b.desk.xmxn),
      caption: "xMXN of exchange liquidity",
      note: "Dollars in, pesos out, on Tempo",
    },
    {
      name: "Lend",
      verb: "Advances for gig workers",
      href: "/credit",
      icon: HandCoins,
      value: n0(b.pool.loansOut),
      caption: `xMXN lent · ${n0(b.pool.cash)} available`,
      note: "Uncollateralized, on Demo Uber Data",
    },
    {
      name: "Spend",
      verb: "Pay bills and APIs over HTTP",
      href: "/pay",
      icon: Receipt,
      value: n0(merchant.xmxn),
      caption: "xMXN paid through MPP",
      note: "Real 402 payments, SIMULATED top-ups",
    },
  ];

  return (
    <Panel
      title="The system"
      description="A parallel financial system for emerging markets, on Tempo: four modules around one synthetic currency."
    >
      <div className="relative mt-2">
        <div data-nav="grid" className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
          {modules.map((m, i) => (
            <Link
              key={m.name}
              href={m.href}
              data-nav-item=""
              className={`bg-muted flex min-h-36 flex-col justify-between gap-3 rounded-[14px] p-5 transition-transform duration-150 ease-out hover:scale-[1.02] ${i % 2 ? "sm:pl-20" : "sm:pr-20"}`}
            >
              <span className="flex items-center gap-3">
                <m.icon className="size-6 stroke-[1.5]" aria-hidden />
                <span className="text-lg font-semibold">{m.name}</span>
                <span className="text-muted-foreground hidden truncate text-sm md:inline">{m.verb}</span>
              </span>
              <span className="grid gap-0.5">
                <span className="text-3xl font-semibold tabular">{m.value}</span>
                <span className="text-muted-foreground text-sm">{m.caption}</span>
              </span>
              <span className="text-muted-foreground text-xs">{m.note}</span>
            </Link>
          ))}
        </div>
        {/* Hub: every module runs on the same xMXN. */}
        <div
          aria-label={`xMXN in circulation: ${n0(b.xmxnSupply)}`}
          className="bg-card shadow-tile pointer-events-none absolute top-1/2 left-1/2 hidden size-32 -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center rounded-full text-center sm:flex"
        >
          <span className="text-lg font-semibold">xMXN</span>
          <span className="text-sm tabular">{n0(b.xmxnSupply)}</span>
          <span className="text-muted-foreground text-[11px]">in circulation</span>
        </div>
      </div>
      <p className="text-muted-foreground mt-4 text-xs">
        Testnet: collateral and xMXN have no real value. Lend uses Demo Uber Data; Spend top-ups are SIMULATED.
      </p>
    </Panel>
  );
}
