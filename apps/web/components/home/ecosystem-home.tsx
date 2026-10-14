"use client";
// Mercado home: a peso economy on Tempo. One currency, six products: an editorial numbered index with
// one live number each (arrow keys + Enter), the "Built on Tempo" primitives with live proofs, then the
// money map drawn flat. English (josu 03:20); the phone apps stay Spanish.
// Every number is read live from chain (josu's wiring rule: no fixtures, no hardcoded numbers).
import Link from "next/link";
import { useRef, useState, type KeyboardEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { Route } from "lucide-react";
import { CARD_ENABLED, PROTOCOL, useActivityFeed, useCardStats, useThreeBuckets } from "@/lib/contracts";
import { useNow } from "@/lib/use-now";
import { fmtAmount, fmtBps } from "@/lib/format";
import { cn } from "@/lib/utils";
import { LiveMeta, Meta, PRODUCTS, type ProductId } from "@/components/console";
import { useTour } from "@/components/tour/demo-tour";
import { Button } from "@/components/ui/button";
import { BuiltOnTempo } from "./built-on-tempo";
import { TickerText, useReducedMotion } from "@/lib/motion";

const n0 = (v: bigint | undefined) => (v === undefined ? "—" : fmtAmount(v, 0));

type Pid = Exclude<ProductId, "home">;
type Live = Record<Pid, { value: string; caption: string }>;

type Vault = { aprBps: number } | null;
type InvestRates = { usd: Vault; mxn: Vault; stocks: { symbol: string; price: number; valid: boolean } | null };
const pct = (bps: number) => `${(bps / 100).toFixed(2)}%`;

/** Invest returns from GET /api/invest/rates: on-chain configured vault APRs and the mIDX feed price. */
function useInvestRates() {
  return useQuery({
    queryKey: ["invest-rates"],
    refetchInterval: 30_000,
    queryFn: async () => {
      const r = await fetch("/api/invest/rates");
      if (!r.ok) throw new Error(`rates ${r.status}`);
      return (await r.json()) as InvestRates;
    },
  });
}

function useLive() {
  const b = useThreeBuckets();
  const card = useCardStats();
  const rates = useInvestRates().data;
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
    // Real configured returns only (lead 03:31): dollars (sOUSD), pesos (sxMXN, once deployed), stocks (mIDX price).
    invest: {
      value: rates?.usd ? pct(rates.usd.aprBps) : "—",
      caption: [
        rates?.usd && "a year on dollars",
        rates?.mxn && `${pct(rates.mxn.aprBps)} on pesos`,
        rates?.stocks?.valid && `${rates.stocks.symbol} at US$${rates.stocks.price.toFixed(2)}`,
      ]
        .filter(Boolean)
        .join(" · ") || "returns on dollars, pesos and stocks",
    },
  };
  return { b, live };
}

export function EcosystemHome() {
  const { b, live } = useLive();
  const tour = useTour();
  return (
    // V6-TASTE #3: 16px section gaps on phones; the desktop rhythm stays.
    <div className="grid min-w-0 gap-4 pt-1 sm:gap-14">
      {/* The hero is a size container so the display lines fit the content column (not the viewport,
          which includes the sidebar). Measured in Archivo Black: "ONE CURRENCY." is 8.86em and "PRODUCTS." 6.27em,
          so from sm up each line fits whole at 10.9cqw; on phones words wrap and the longest fits at 15cqw. */}
      <section className="grid min-w-0 gap-4 [container-type:inline-size] sm:gap-6">
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-1 border-b pb-3">
          <Meta>■ 00 · Mercado · a peso economy on Tempo</Meta>
          <LiveMeta />
        </div>
        {/* Principle 3: image inside type, once, on the hero. Our own generated sarape texture. */}
        <h1
          data-loop // the slow texture pan is an intentional continuous loop (reduced motion: still)
          // Dark theme: a cream-for-ink variant of the texture (black bands vanish on dark and chop the letters).
          // pt: background-clip:text only paints the padding box, and the caps rise above the tight line box.
          className="display image-type mx-pan bg-[url(/photos/sarape.webp)] pt-[0.1em] text-[clamp(2rem,10cqw,2.5rem)] sm:text-[clamp(2.2rem,min(10.9cqw,22svh),12rem)] dark:bg-[url(/photos/sarape-dark.webp)]"
          aria-label="One currency. Six products."
        >
          One currency.
          <br />
          Six products.
        </h1>
        <div className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
          <p className="max-w-2xl text-lg leading-snug text-pretty sm:text-xl">
            Create pesos. Send them home. Borrow, spend, and save on Tempo.
          </p>
          <Button size="lg" onClick={() => (tour.active ? tour.go(tour.index) : tour.start())} disabled={tour.going}>
            <Route strokeWidth={1.75} />
            {tour.active ? "Resume the Demo Tour" : "Start the Demo Tour"}
          </Button>
        </div>
        {/* V6-TASTE #1: the connected economy, in the first viewport, before the directory. */}
        <EconomyScene live={live} supply={b.xmxnSupply} />
      </section>

      {/* lead 05:15: hero → Demo Tour → the six products in their colors with live numbers → Built on Tempo. */}
      <ProductIndex live={live} />

      <BuiltOnTempo />

      <section aria-labelledby="flow-h" className="grid gap-4 border-t pt-4">
        <Meta>Live numbers from Tempo Moderato · the moving dots show the mechanism, not individual transfers</Meta>
        <h2 id="flow-h" className="display text-[clamp(2.2rem,5vw,4rem)]">
          How the money moves
        </h2>
        <FlowMap live={live} supply={b.xmxnSupply} />
      </section>
    </div>
  );
}

const ago = (unix: number | undefined, now: number | undefined) => {
  if (!unix || !now) return undefined;
  const s = Math.max(0, Math.floor(now - unix));
  return s < 90 ? `${s}s ago` : s < 5400 ? `${Math.round(s / 60)}m ago` : s < 129600 ? `${Math.round(s / 3600)}h ago` : `${Math.round(s / 86400)}d ago`;
};

// unit: the qualifier that makes each product's own number readable in the same row (lead 09:41).
const BRANCHES: { id: Pid; verb: string; unit: string }[] = [
  { id: "remesas", verb: "sends home", unit: "xMXN issued" },
  { id: "global", verb: "pays suppliers", unit: "backing" },
  { id: "credito", verb: "lends", unit: "xMXN to lend" },
  { id: "card", verb: "spends", unit: "xMXN spent" },
  { id: "invest", verb: "saves", unit: "a year" },
];

/**
 * V6-TASTE #1: one connected economy in ≤170px. xMXN at the center: Mint issues it; it branches to the exchange
 * (Remesas, Global), credit, spending and saving. Every node shows ITS OWN product's live number and links to it;
 * nothing implies the numbers are one trace. One real recent receipt (the exchange's latest OUSD→xMXN swap) is
 * shown as itself, with its time and explorer link. A static mechanism: no decorative circulation.
 */
function EconomyScene({ live, supply }: { live: Live; supply: bigint | undefined }) {
  const feed = useActivityFeed("move", { limit: 30 });
  const now = useNow(15_000);
  const receipt = feed.rows.find((r) => r.label === "OUSD → xMXN");
  const P = (id: Pid) => PRODUCTS.find((x) => x.id === id)!;
  const ys = [10, 30, 50, 70, 90];
  const receiptLine = feed.isPending ? (
    <span className="text-muted-foreground">Reading Tempo…</span>
  ) : feed.isError && !receipt ? (
    <span className="text-muted-foreground">Couldn&apos;t read Tempo</span>
  ) : receipt ? (
    <a href={receipt.url} target="_blank" rel="noreferrer" className="hover:underline">
      <span className="font-semibold tabular">
        US${fmtAmount(receipt.amount)} → MX${fmtAmount(receipt.amountOut ?? 0n)}
      </span>{" "}
      <span className="text-muted-foreground">
        · {ago(receipt.timestamp, now) ?? "recent"}
        <span className="hidden sm:inline"> · explorer ↗</span>
      </span>
    </a>
  ) : (
    <span className="text-muted-foreground">No recent transfer to show.</span>
  );
  return (
    <figure aria-label="One connected economy: xMXN flows from Mint to the five other products" className="bg-well rounded-[8px] px-4 py-2.5">
      {/* Desktop: the mechanism as a diagram. */}
      <div className="relative hidden h-[140px] sm:block">
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full" aria-hidden>
          <path d="M17 50 L23 50" stroke="var(--c-mint)" strokeWidth="2" vectorEffect="non-scaling-stroke" fill="none" />
          {BRANCHES.map((br, i) => (
            <path key={br.id} d={`M35 50 C 39 50, 38 ${ys[i]}, 42 ${ys[i]}`} stroke={P(br.id).color} strokeWidth="2" vectorEffect="non-scaling-stroke" fill="none" />
          ))}
        </svg>
        <Link href="/mint" className="absolute top-1/2 left-0 grid w-[17%] -translate-y-1/2 rounded-[4px] hover:underline">
          {/* Review P1: small names are ink (AA); the product color lives on the dot and the paths. */}
          <span className="flex items-center gap-1.5 text-[13px] font-semibold">
            <span className="size-2 shrink-0 rounded-full" style={{ background: P("mint").color }} aria-hidden />
            Mint issues
          </span>
          <span className="text-[1.15rem] leading-tight font-semibold tabular">{live.mint.value}</span>
          <span className="text-muted-foreground text-[12px] leading-tight">{live.mint.caption}</span>
        </Link>
        <div className="absolute top-1/2 left-[23%] grid w-[12%] -translate-y-1/2 justify-items-center rounded-[8px] border-2 border-current bg-background px-2 py-1.5 text-center">
          <span className="display text-[1.1rem] leading-none">xMXN</span>
          <span className="text-[13px] font-semibold tabular">{supply === undefined ? "—" : fmtAmount(supply, 0)}</span>
          <span className="text-muted-foreground text-[11px] leading-tight">in circulation</span>
        </div>
        {BRANCHES.map((br, i) => (
          <Link
            key={br.id}
            href={P(br.id).href}
            className="absolute left-[42%] flex w-[33%] -translate-y-1/2 items-baseline gap-1.5 truncate text-[13px] hover:underline"
            style={{ top: `${ys[i]}%` }}
          >
            <span className="size-2 shrink-0 self-center rounded-full" style={{ background: P(br.id).color }} aria-hidden />
            <span className="font-semibold">{P(br.id).short}</span>
            <span className="text-muted-foreground">{br.verb}</span>
            <span className="ml-auto font-semibold tabular">{live[br.id].value}</span>
            <span className="text-muted-foreground">{br.unit}</span>
          </Link>
        ))}
        <div className="absolute top-1/2 right-0 grid w-[24%] -translate-y-1/2 gap-0.5 text-[13px]">
          <span className="text-muted-foreground text-[12px]">Latest exchange receipt (Remesas or Global)</span>
          {receiptLine}
        </div>
      </div>
      {/* Phone: hub, the five branches as linked chips, the receipt. */}
      <div className="grid gap-2 sm:hidden">
        <p className="flex flex-wrap items-baseline gap-x-2 text-[13px]">
          <Link href="/mint" className="flex items-center gap-1.5 self-center font-semibold">
            <span className="size-2 rounded-full" style={{ background: P("mint").color }} aria-hidden />
            Mint
          </Link>
          <span className="text-muted-foreground">issues</span>
          <span className="display text-[1rem]">xMXN</span>
          <span className="font-semibold tabular">{supply === undefined ? "—" : fmtAmount(supply, 0)}</span>
          <span className="text-muted-foreground">in circulation</span>
        </p>
        <div className="scrollbar-none -mx-4 flex gap-1.5 overflow-x-auto px-4">
          {BRANCHES.map((br) => (
            <Link key={br.id} href={P(br.id).href} className="flex min-h-9 shrink-0 items-center gap-1.5 rounded-full border px-3 text-[13px] font-semibold">
              <span className="size-2 rounded-full" style={{ background: P(br.id).color }} aria-hidden />
              {P(br.id).short}
            </Link>
          ))}
        </div>
        {/* Two lines reserved from first paint, so the receipt arriving doesn't push the index (390 CLS). */}
        <p className="min-h-[2.8em] text-[13px] leading-[1.4]">
          <span className="text-muted-foreground">Latest exchange receipt </span>
          {receiptLine}
        </p>
      </div>
    </figure>
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
    // V5-TASTE #6: the six products scan as one system: 32px after the hero, compact rows, Archivo only for the
    // product name, a 15px sentence and a 24px tabular metric. ≥4 rows visible at 1440x900.
    <section aria-label="Products" className="grid gap-3 sm:-mt-6">
      <Meta>Index · six products, one currency</Meta>
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
              className="mx-sweep group grid min-h-[72px] grid-cols-[2rem_minmax(0,1fr)_auto] items-baseline gap-x-4 py-4 sm:grid-cols-[3rem_minmax(0,1fr)_auto] sm:px-2"
              style={{ ["--sweep" as string]: p.color }}
              aria-label={`${p.index} ${p.name}: ${p.line}. ${live[p.id as Pid].value} ${live[p.id as Pid].caption}`}
            >
              <span className="meta text-muted-foreground tabular">{p.index}</span>
              {/* Each name in its color (large display type, ≥3:1); Invest stays ink with a maize mark (R-050).
                  Desktop: name and sentence on one baseline; phone: the sentence sits under the name. */}
              <span className="flex min-w-0 flex-col gap-0.5 sm:flex-row sm:items-baseline sm:gap-4">
                <span
                  className="display shrink-0 text-[clamp(1.75rem,3.2vw,2.75rem)] decoration-[var(--mark)] decoration-[0.08em] underline-offset-[0.12em] group-hover:underline group-focus-visible:underline"
                  style={{ color: p.id === "invest" ? "var(--ink)" : p.color, ["--mark" as string]: p.color }}
                >
                  {p.short}
                </span>
                <span className="text-muted-foreground hidden min-w-0 text-[15px] sm:inline">{p.line}</span>
              </span>
              <span className="text-right sm:self-center">
                <span className="block text-[1.5rem] leading-tight font-semibold tabular" style={{ color: p.id === "invest" ? undefined : p.color }}>
                  <TickerText text={live[p.id as Pid].value} />
                </span>
                {/* V6-TASTE #7: qualifiers in sentence case at 13px, not tracked capitals. */}
                <span className="text-muted-foreground hidden text-[13px] leading-snug sm:block">{live[p.id as Pid].caption}</span>
              </span>
              {/* Phone (V6-TASTE #3): name + metric share the first line; purpose and metric label share the second. */}
              <span className="text-muted-foreground col-span-2 col-start-2 text-[13px] leading-snug sm:hidden">
                {p.line} · {live[p.id as Pid].caption}
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
  { product: "invest", label: "savings in, returns out", outbound: true },
];
const curve = (a: { x: number; y: number }, b: { x: number; y: number }) => {
  const mx = (a.x + b.x) / 2;
  return `M${a.x} ${a.y} C ${mx} ${a.y}, ${mx} ${b.y}, ${b.x} ${b.y}`;
};



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
              {/* R-050: 16px labels in ink; the product color is the marker, not the text. */}
              <span className={cn("flex items-center gap-1.5 text-base font-semibold", center ? "justify-center" : right && "justify-end")}>
                <span className="inline-block size-2.5" style={{ background: p.color }} aria-hidden />
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
                <p className="flex items-center gap-1.5 font-semibold">
                  <span className="inline-block size-2.5" style={{ background: p.color }} aria-hidden />
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
