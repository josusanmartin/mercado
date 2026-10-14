"use client";
// Mercado home (Brand v4): one currency, four products. A row of four big solid product tiles, each
// with one live number (arrow keys + Enter, cyan focus ring), then the money map drawn flat.
// Every number is read live from chain (josu's wiring rule: no fixtures, no hardcoded numbers).
import Link from "next/link";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { Route } from "lucide-react";
import { CARD_ENABLED, PROTOCOL, useCardStats, useThreeBuckets } from "@/lib/contracts";
import { fmtAmount, fmtBps } from "@/lib/format";
import { cn } from "@/lib/utils";
import { LiveMeta, Meta, PRODUCTS, type ProductId } from "@/components/console";
import { useTour } from "@/components/tour/demo-tour";
import { Button } from "@/components/ui/button";

const n0 = (v: bigint | undefined) => (v === undefined ? "—" : fmtAmount(v, 0));

type Pid = Exclude<ProductId, "home">;
type Live = Record<Pid, { value: string; caption: string }>;

function useLive() {
  const b = useThreeBuckets();
  const card = useCardStats();
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
    card: CARD_ENABLED
      ? { value: n0(card.totalSpent), caption: `xMXN spent with Card · ${card.charges?.toString() ?? "—"} charges` }
      : { value: "—", caption: "Card runs on v2" },
    // Ahorro en pesos IS the credit pool's supply: lender claims are real savings today.
    invest: { value: n0(b.pool.lenderClaims), caption: "xMXN saved by lenders" },
  };
  return { b, live };
}

export function EcosystemHome() {
  const { b, live } = useLive();
  const tour = useTour();
  return (
    <div className="grid gap-14 pt-1">
      <section className="grid gap-6">
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-1 border-b pb-3">
          <Meta>■ 00 · Mercado · un sistema financiero paralelo</Meta>
          <LiveMeta />
        </div>
        {/* Principle 3: image inside type, once, on the hero. Our own generated sarape texture. */}
        <h1
          className="display image-type text-[clamp(3.6rem,12.5vw,12rem)]"
          style={{ backgroundImage: "url(/photos/sarape.webp)" }}
          aria-label="Una moneda. Seis productos."
        >
          Una moneda.
          <br />
          Seis productos.
        </h1>
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
          <p className="max-w-2xl text-xl leading-snug text-pretty">
            A parallel financial system for emerging markets, on Tempo. Institutions mint xMXN, families and businesses move it across the border,
            drivers borrow it, shops take it, savers grow it.
          </p>
          <Button size="lg" onClick={() => (tour.active ? tour.go(tour.index) : tour.start())} disabled={tour.going}>
            <Route strokeWidth={1.75} />
            {tour.active ? "Resume the Demo Tour" : "Start the Demo Tour"}
          </Button>
        </div>
      </section>

      <ProductIndex live={live} />

      <section aria-labelledby="flow-h" className="grid gap-4 border-t pt-4">
        <Meta>Live on Tempo Moderato · updates as transactions land</Meta>
        <h2 id="flow-h" className="display text-[clamp(2.2rem,5vw,4rem)]">
          Así se mueve el dinero
        </h2>
        <FlowMap live={live} supply={b.xmxnSupply} />
      </section>
    </div>
  );
}

/** The six products as an editorial numbered index (no tiles): ↑/↓ move, Enter opens. */
function ProductIndex({ live }: { live: Live }) {
  const products = PRODUCTS.filter((p) => p.id !== "home");
  const refs = useRef<(HTMLAnchorElement | null)[]>([]);
  const [sel, setSel] = useState(0);
  function onKey(e: KeyboardEvent<HTMLOListElement>) {
    const d = ({ ArrowDown: 1, ArrowUp: -1 } as Record<string, number>)[e.key];
    if (d === undefined) return;
    const next = sel + d;
    if (next < 0 || next >= products.length) return;
    e.preventDefault();
    refs.current[next]?.focus();
  }
  return (
    <section aria-label="Products" className="grid gap-3">
      <Meta>Índice · six products, one currency</Meta>
      <ol onKeyDown={onKey} className="border-t">
        {products.map((p, i) => (
          <li key={p.id} className="border-b">
            <Link
              ref={(el) => {
                refs.current[i] = el;
              }}
              href={p.href}
              tabIndex={i === sel ? 0 : -1}
              onFocus={() => setSel(i)}
              onMouseEnter={() => setSel(i)}
              className="group grid grid-cols-[2.5rem_minmax(0,1fr)] items-baseline gap-x-4 gap-y-1 py-5 transition-colors duration-150 sm:grid-cols-[3rem_minmax(0,1fr)_auto] sm:py-6"
              aria-label={`${p.index} ${p.name}: ${p.line}. ${live[p.id as Pid].value} ${live[p.id as Pid].caption}`}
            >
              <span className="meta text-muted-foreground tabular">{p.index}</span>
              <span className="min-w-0">
                <span className="display block text-[clamp(2.4rem,6vw,5rem)] transition-colors duration-150 group-hover:text-[var(--hover)] group-focus-visible:text-[var(--hover)]" style={{ ["--hover" as string]: p.color }}>
                  {p.short}
                </span>
                <span className="text-muted-foreground mt-1 block text-lg">— {p.line}</span>
              </span>
              <span className="col-start-2 text-left sm:col-start-3 sm:text-right">
                <span className="display block text-[clamp(1.6rem,3vw,2.6rem)] tabular" style={{ color: p.id === "invest" ? undefined : p.color }}>
                  {live[p.id as Pid].value}
                </span>
                <span className="meta text-muted-foreground">{live[p.id as Pid].caption}</span>
              </span>
            </Link>
          </li>
        ))}
      </ol>
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
          <p className="display text-2xl">xMXN</p>
          <p className="display text-[2.6rem] tabular">{supply === undefined ? "—" : fmtAmount(supply, 0)}</p>
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
              <span className="display text-[2rem] tabular">{live[f.product].value}</span>
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
