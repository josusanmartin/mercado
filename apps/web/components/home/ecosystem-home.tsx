"use client";
// Mercado home: the ecosystem at a glance. One currency (xMXN) in the middle, four products around it,
// money visibly flowing between them, and every number read live from chain (no fixtures).
import Link from "next/link";
import { useEffect, useState } from "react";
import { Route } from "lucide-react";
import { PROTOCOL, useThreeBuckets } from "@/lib/contracts";
import { fmtAmount, fmtBps } from "@/lib/format";
import { cn } from "@/lib/utils";
import { PRODUCTS, ProductHero, type ProductId } from "@/components/console";
import { useTour } from "@/components/tour/demo-tour";
import { Button } from "@/components/ui/button";

const n0 = (v: bigint | undefined) => (v === undefined ? "—" : fmtAmount(v, 0));

type Live = Record<Exclude<ProductId, "home">, { value: string; caption: string }>;

function useLive() {
  const b = useThreeBuckets();
  const v2 = PROTOCOL === "v2";
  const live: Live = {
    mint: v2
      ? { value: n0(b.vault.collateralValueXmxn), caption: "xMXN of collateral locked" }
      : { value: n0(b.vault.collateralOusd), caption: "OUSD of collateral locked" },
    remesas: v2
      ? { value: n0(b.move?.liabilityXmxn), caption: "xMXN issued through the exchange" }
      : { value: n0(b.desk.xmxn), caption: "xMXN ready to send (swap desk)" },
    global: v2
      ? { value: b.move?.coverageBps === undefined ? "—" : fmtBps(b.move.coverageBps, 0), caption: "exchange backing (coverage)" }
      : { value: n0(b.desk.ousd), caption: "OUSD held by the swap desk" },
    credito: { value: n0(b.pool.loansOut), caption: `xMXN lent · ${n0(b.pool.cash)} available` },
  };
  return { b, live };
}

export function EcosystemHome() {
  const { b, live } = useLive();
  const tour = useTour();
  return (
    <div className="grid gap-8">
      <ProductHero
        product="home"
        title="One currency. Four products."
        purpose="Mercado is a parallel financial system for emerging markets on Tempo. Institutions mint xMXN, families and businesses move it across the border, drivers borrow it, and everyone spends it over HTTP."
        kpis={[
          { label: "xMXN in circulation", value: n0(b.xmxnSupply), sub: "every one backed by a debt position or the exchange reserve" },
          live.mint.value === "—" ? { label: "Collateral locked", value: "—" } : { label: "Collateral locked", value: live.mint.value, sub: live.mint.caption },
          { label: "Lent to drivers", value: n0(b.pool.loansOut), sub: `${n0(b.pool.cash)} xMXN available to lend` },
        ]}
        demo={undefined}
      />

      <section aria-labelledby="flow-h" className="bg-card shadow-tile rounded-[14px] border p-5 sm:p-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="flow-h" className="text-lg font-semibold">
              How money moves
            </h2>
            <p className="text-muted-foreground text-sm">Live on Tempo Moderato. Numbers update as transactions land.</p>
          </div>
          <Button onClick={() => (tour.active ? tour.go(tour.index) : tour.start())} disabled={tour.going}>
            <Route />
            {tour.active ? "Resume the Demo Tour" : "Start the Demo Tour"}
          </Button>
        </div>
        <FlowMap live={live} supply={b.xmxnSupply} />
      </section>

      <section aria-label="Products" className="grid gap-4 sm:grid-cols-2">
        {PRODUCTS.filter((p) => p.id !== "home").map((p) => {
          const l = live[p.id as keyof Live];
          return (
            <Link
              key={p.id}
              href={p.href}
              data-product={p.id}
              className="bg-card shadow-tile group relative grid gap-4 overflow-hidden rounded-[14px] border p-5 transition-colors duration-150 hover:border-product sm:p-6"
            >
              <span className="bg-product absolute inset-x-0 top-0 h-1" aria-hidden />
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-product flex items-center gap-2 text-sm font-semibold">
                    <p.icon className="size-4" aria-hidden />
                    {p.name}
                  </p>
                  <p className="mt-1 text-xl font-semibold tracking-tight text-pretty">{p.purpose}</p>
                </div>
              </div>
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <p className="text-product text-4xl font-semibold tracking-tight tabular">{l.value}</p>
                  <p className="text-muted-foreground text-sm">{l.caption}</p>
                </div>
                <span className="text-muted-foreground text-sm">For: {p.audience}</span>
              </div>
            </Link>
          );
        })}
      </section>
    </div>
  );
}

/** Product positions on the 1000×440 diagram, and the flows between them. */
const NODES: Record<Exclude<ProductId, "home">, { x: number; y: number }> = {
  mint: { x: 170, y: 105 },
  remesas: { x: 830, y: 105 },
  global: { x: 830, y: 335 },
  credito: { x: 170, y: 335 },
};
const HUB = { x: 500, y: 220 };

const FLOWS: { from: keyof typeof NODES | "hub"; to: keyof typeof NODES | "hub"; label: string; product: keyof typeof NODES }[] = [
  { from: "mint", to: "hub", label: "collateral in, xMXN minted", product: "mint" },
  { from: "hub", to: "remesas", label: "dollars in, pesos delivered", product: "remesas" },
  { from: "hub", to: "global", label: "MXN↔USD for businesses", product: "global" },
  { from: "hub", to: "credito", label: "advances out, repaid with fees", product: "credito" },
];

const pt = (k: keyof typeof NODES | "hub") => (k === "hub" ? HUB : NODES[k]);
const curve = (a: { x: number; y: number }, b: { x: number; y: number }) => {
  const mx = (a.x + b.x) / 2;
  return `M${a.x} ${a.y} C ${mx} ${a.y}, ${mx} ${b.y}, ${b.x} ${b.y}`;
};

function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const m = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(m.matches);
    const on = () => setReduced(m.matches);
    m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, []);
  return reduced;
}

function FlowMap({ live, supply }: { live: Live; supply: bigint | undefined }) {
  const reduced = useReducedMotion();
  return (
    <>
      {/* Desktop: the diagram */}
      <div className="relative mt-4 hidden aspect-[1000/440] w-full md:block">
        <svg viewBox="0 0 1000 440" className="absolute inset-0 h-full w-full" aria-hidden>
          {FLOWS.map((f, i) => {
            const d = curve(pt(f.from), pt(f.to));
            const color = `var(--c-${f.product})`;
            return (
              <g key={i}>
                <path d={d} fill="none" stroke={color} strokeOpacity={0.25} strokeWidth={10} strokeLinecap="round" />
                <path d={d} fill="none" stroke={color} strokeWidth={2} strokeDasharray="2 10" strokeLinecap="round" />
                {!reduced &&
                  [0, 1, 2].map((k) => (
                    <circle key={k} r={5} fill={color}>
                      <animateMotion dur="3.6s" begin={`-${k * 1.2 + i * 0.3}s`} repeatCount="indefinite" path={d} />
                    </circle>
                  ))}
              </g>
            );
          })}
          <circle cx={HUB.x} cy={HUB.y} r={92} fill="var(--well)" stroke="var(--line)" />
        </svg>
        <div className="absolute grid -translate-x-1/2 -translate-y-1/2 place-items-center text-center" style={{ left: "50%", top: `${(HUB.y / 440) * 100}%` }}>
          <p className="text-2xl font-bold tracking-tight">xMXN</p>
          <p className="text-lg font-semibold tabular">{supply === undefined ? "—" : fmtAmount(supply, 0)}</p>
          <p className="text-muted-foreground text-xs">in circulation</p>
        </div>
        {(Object.keys(NODES) as (keyof typeof NODES)[]).map((id) => {
          const p = PRODUCTS.find((x) => x.id === id)!;
          const n = NODES[id];
          return (
            <Link
              key={id}
              href={p.href}
              data-product={id}
              className="bg-card hover:border-product absolute w-[22%] -translate-x-1/2 -translate-y-1/2 rounded-[12px] border p-3 shadow-tile transition-colors duration-150"
              style={{ left: `${(n.x / 1000) * 100}%`, top: `${(n.y / 440) * 100}%` }}
            >
              <p className="text-product flex items-center gap-1.5 text-sm font-semibold">
                <p.icon className="size-4" aria-hidden />
                {p.short}
              </p>
              <p className="mt-1 text-2xl font-semibold tracking-tight tabular">{live[id].value}</p>
              <p className="text-muted-foreground text-xs leading-snug">{live[id].caption}</p>
            </Link>
          );
        })}
        {FLOWS.map((f, i) => {
          const a = pt(f.from);
          const b = pt(f.to);
          return (
            <p
              key={i}
              className="text-muted-foreground bg-card/80 absolute -translate-x-1/2 -translate-y-1/2 rounded px-1.5 text-[11px] whitespace-nowrap"
              style={{ left: `${((a.x + b.x) / 2 / 1000) * 100}%`, top: `${(((a.y + b.y) / 2 + (b.y > a.y ? 18 : -18)) / 440) * 100}%` }}
            >
              {f.label}
            </p>
          );
        })}
      </div>
      {/* Phones: the same flows as a list */}
      <ol className="mt-4 grid gap-2 md:hidden">
        {FLOWS.map((f) => {
          const p = PRODUCTS.find((x) => x.id === f.product)!;
          return (
            <li key={f.product} data-product={f.product} className="bg-well flex items-center justify-between gap-3 rounded-[10px] p-3">
              <div>
                <p className="text-product text-sm font-semibold">{p.short}</p>
                <p className="text-muted-foreground text-xs">{f.label}</p>
              </div>
              <div className="text-right">
                <p className={cn("font-semibold tabular")}>{live[f.product].value}</p>
                <p className="text-muted-foreground text-[11px]">{live[f.product].caption}</p>
              </div>
            </li>
          );
        })}
      </ol>
    </>
  );
}
