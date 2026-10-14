"use client";
// Mercado home (Brand v4): one currency, four products. A row of four big solid product tiles, each
// with one live number (arrow keys + Enter, cyan focus ring), then the money map drawn flat.
// Every number is read live from chain (josu's wiring rule: no fixtures, no hardcoded numbers).
import Link from "next/link";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { Route } from "lucide-react";
import { PROTOCOL, useThreeBuckets } from "@/lib/contracts";
import { fmtAmount, fmtBps } from "@/lib/format";
import { cn } from "@/lib/utils";
import { PRODUCTS, type ProductId } from "@/components/console";
import { useTour } from "@/components/tour/demo-tour";
import { Button } from "@/components/ui/button";

const n0 = (v: bigint | undefined) => (v === undefined ? "—" : fmtAmount(v, 0));

type Pid = Exclude<ProductId, "home">;
type Live = Record<Pid, { value: string; caption: string }>;

function useLive() {
  const b = useThreeBuckets();
  const v2 = PROTOCOL === "v2";
  const live: Live = {
    mint: v2
      ? { value: n0(b.vault.collateralValueXmxn), caption: "xMXN of collateral locked" }
      : { value: n0(b.vault.collateralOusd), caption: "OUSD of collateral locked" },
    remesas: v2
      ? { value: n0(b.move?.liabilityXmxn), caption: "xMXN issued by the exchange" }
      : { value: n0(b.desk.xmxn), caption: "xMXN ready to send" },
    global: v2
      ? { value: b.move?.coverageBps === undefined ? "—" : fmtBps(b.move.coverageBps, 0), caption: "exchange backing" }
      : { value: n0(b.desk.ousd), caption: "OUSD of exchange liquidity" },
    credito: { value: n0(b.pool.cash), caption: "xMXN available to lend" },
    // Wired to MercadoCard's events once contracts deploys it (deployments.v2.card); never a placeholder number.
    card: { value: "—", caption: "spent with Card (runs on v2)" },
    // Ahorro en pesos IS the credit pool's supply: lender claims are real savings today.
    invest: { value: n0(b.pool.lenderClaims), caption: "xMXN saved by lenders" },
  };
  return { b, live };
}

export function EcosystemHome() {
  const { b, live } = useLive();
  const tour = useTour();
  return (
    <div className="grid gap-12 pt-2">
      <section className="grid gap-3">
        <h1 className="text-[2.5rem] leading-[1.05] font-semibold tracking-tight text-balance sm:text-[3.4rem]">
          Mercado: one currency, six products.
        </h1>
        <p className="text-muted-foreground max-w-2xl text-lg text-pretty">
          A parallel financial system for emerging markets on Tempo. Institutions mint xMXN, families and businesses move it across the border, drivers borrow it, and everyone spends it over HTTP.
        </p>
        <dl className="mt-4 grid grid-cols-1 gap-5 sm:grid-cols-3 sm:gap-10">
          <Kpi label="xMXN in circulation" value={n0(b.xmxnSupply)} sub="each backed by a debt position or the exchange reserve" />
          <Kpi label="Collateral locked" value={live.mint.value} sub={live.mint.caption} />
          <Kpi label="Lent to drivers" value={n0(b.pool.loansOut)} sub={`${n0(b.pool.cash)} xMXN available`} />
        </dl>
      </section>

      <ProductRow live={live} />

      <section aria-labelledby="flow-h" className="grid gap-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="flow-h" className="text-2xl font-semibold tracking-tight">
              How money moves
            </h2>
            <p className="text-muted-foreground">Live on Tempo Moderato. Numbers update as transactions land.</p>
          </div>
          <Button variant="outline" onClick={() => (tour.active ? tour.go(tour.index) : tour.start())} disabled={tour.going}>
            <Route strokeWidth={1.75} />
            {tour.active ? "Resume the Demo Tour" : "Start the Demo Tour"}
          </Button>
        </div>
        <FlowMap live={live} supply={b.xmxnSupply} />
      </section>
    </div>
  );
}

function Kpi({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-muted-foreground text-sm">{label}</dt>
      <dd className="mt-1 truncate text-[2.2rem] leading-none font-semibold tracking-tight tabular sm:text-[2.6rem]">{value}</dd>
      {sub && <dd className="text-muted-foreground mt-1 text-[13px]">{sub}</dd>}
    </div>
  );
}

/** The Switch row: four big solid tiles; arrows move, Enter opens. */
function ProductRow({ live }: { live: Live }) {
  const products = PRODUCTS.filter((p) => p.id !== "home");
  const refs = useRef<(HTMLAnchorElement | null)[]>([]);
  const [sel, setSel] = useState(0);
  useEffect(() => {
    refs.current = refs.current.slice(0, products.length);
  }, [products.length]);

  function onKey(e: KeyboardEvent<HTMLDivElement>) {
    const cols = getComputedStyle(e.currentTarget).gridTemplateColumns.split(" ").length || 1;
    const d = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: cols, ArrowUp: -cols }[e.key as string];
    if (d === undefined) return;
    const next = sel + d;
    if (next < 0 || next >= products.length) return;
    e.preventDefault();
    refs.current[next]?.focus();
  }

  return (
    <section aria-label="Products">
      <p className="mb-3 h-7 text-lg font-semibold" style={{ color: products[sel].color }} aria-hidden>
        {products[sel].name}
      </p>
      <div role="toolbar" aria-label="Mercado products" onKeyDown={onKey} className="grid grid-cols-2 gap-4 sm:grid-cols-3 sm:gap-5">
        {products.map((p, i) => (
          <Link
            key={p.id}
            ref={(el) => {
              refs.current[i] = el;
            }}
            href={p.href}
            tabIndex={i === sel ? 0 : -1}
            onFocus={() => setSel(i)}
            onMouseEnter={() => setSel(i)}
            aria-label={`${p.name}: ${live[p.id as Pid].value} ${live[p.id as Pid].caption}`}
            className={cn(
              "relative flex aspect-[16/10] flex-col justify-between rounded-[20px] p-5 text-white transition-[transform,box-shadow] duration-150 ease-out sm:p-6",
              "hover:shadow-tile focus-visible:shadow-tile hover:scale-[1.03] focus-visible:scale-[1.03] focus-visible:outline-4 focus-visible:outline-offset-4 focus-visible:animate-ring-pulse",
            )}
            style={{ background: p.color, color: p.onColor }}
          >
            <p.icon className="size-10 sm:size-12" strokeWidth={1.75} aria-hidden />
            <span className="grid gap-1">
              <span className="text-2xl leading-none font-semibold tracking-tight tabular sm:text-[2rem]">{live[p.id as Pid].value}</span>
              <span className="text-[13px] leading-snug opacity-85">{live[p.id as Pid].caption}</span>
              <span className="mt-2 text-lg font-semibold">{p.short}</span>
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}

const H = 470;
const NODES: Record<Pid, { x: number; y: number }> = {
  mint: { x: 150, y: 70 },
  remesas: { x: 850, y: 70 },
  global: { x: 850, y: 290 },
  credito: { x: 150, y: 290 },
  card: { x: 360, y: 380 },
  invest: { x: 640, y: 380 },
};
const HUB = { x: 500, y: 180 };
const FLOWS: { product: Pid; label: string; outbound: boolean }[] = [
  { product: "mint", label: "collateral in, xMXN minted", outbound: false },
  { product: "remesas", label: "dollars in, pesos delivered home", outbound: true },
  { product: "global", label: "MXN↔USD for businesses", outbound: true },
  { product: "credito", label: "advances out, repaid with fees", outbound: true },
  { product: "card", label: "xMXN spent at shops", outbound: true },
  { product: "invest", label: "savings in, yield out", outbound: true },
];
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

/** Flat money map: thin colored lines, small moving dots, live numbers as plain text (no boxes). */
function FlowMap({ live, supply }: { live: Live; supply: bigint | undefined }) {
  const reduced = useReducedMotion();
  return (
    <>
      <div className="relative hidden aspect-[1000/470] w-full md:block">
        <svg viewBox={`0 0 1000 ${H}`} className="absolute inset-0 h-full w-full" aria-hidden>
          {FLOWS.map((f, i) => {
            const a = f.outbound ? HUB : NODES[f.product];
            const b = f.outbound ? NODES[f.product] : HUB;
            const d = curve(a, b);
            const color = `var(--c-${f.product})`;
            return (
              <g key={f.product}>
                <path d={d} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" />
                {!reduced &&
                  [0, 1, 2].map((k) => (
                    <circle key={k} r={4} fill={color}>
                      <animateMotion dur="3.6s" begin={`-${k * 1.2 + i * 0.3}s`} repeatCount="indefinite" path={d} />
                    </circle>
                  ))}
                <circle cx={NODES[f.product].x} cy={NODES[f.product].y} r={7} fill={color} />
              </g>
            );
          })}
          <circle cx={HUB.x} cy={HUB.y} r={10} fill="var(--ink)" />
        </svg>
        <div className="absolute grid -translate-x-1/2 text-center" style={{ left: "50%", top: `${((HUB.y - 118) / H) * 100}%` }}>
          <p className="text-xl font-semibold">xMXN</p>
          <p className="text-[2rem] leading-none font-semibold tracking-tight tabular">{supply === undefined ? "—" : fmtAmount(supply, 0)}</p>
          <p className="text-muted-foreground text-[13px]">in circulation</p>
        </div>
        {FLOWS.map((f) => {
          const p = PRODUCTS.find((x) => x.id === f.product)!;
          const n = NODES[f.product];
          const center = n.y > 300;
          const right = n.x > 500;
          return (
            <Link
              key={f.product}
              href={p.href}
              className={cn("absolute grid rounded-[8px] focus-visible:outline-offset-4", center ? "w-[22%] -translate-x-1/2 text-center" : "w-[24%]", !center && (right ? "text-right" : "text-left"))}
              style={{
                left: center ? `${(n.x / 1000) * 100}%` : right ? undefined : `${((n.x - 10) / 1000) * 100}%`,
                right: right && !center ? `${((1000 - n.x - 10) / 1000) * 100}%` : undefined,
                top: `${((n.y + 16) / H) * 100}%`,
              }}
            >
              <span className="text-base font-semibold" style={{ color: p.color }}>
                {p.short}
              </span>
              <span className="text-2xl font-semibold tracking-tight tabular">{live[f.product].value}</span>
              <span className="text-muted-foreground text-[13px] leading-snug">{live[f.product].caption}</span>
              <span className="text-muted-foreground text-[13px] leading-snug">· {f.label}</span>
            </Link>
          );
        })}
      </div>
      <ol className="grid divide-y md:hidden">
        {FLOWS.map((f) => {
          const p = PRODUCTS.find((x) => x.id === f.product)!;
          return (
            <li key={f.product} className="flex items-center justify-between gap-3 py-3">
              <div>
                <p className="font-semibold" style={{ color: p.color }}>
                  {p.short}
                </p>
                <p className="text-muted-foreground text-[13px]">{f.label}</p>
              </div>
              <div className="text-right">
                <p className="text-lg font-semibold tabular">{live[f.product].value}</p>
                <p className="text-muted-foreground text-[13px]">{live[f.product].caption}</p>
              </div>
            </li>
          );
        })}
      </ol>
    </>
  );
}
