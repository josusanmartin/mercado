"use client";
// Mercado Mint: institutional xMXN issuance dashboard. Every number is a live contract read or an event log.
// v1 (default): OUSD only in CollateralVault. v2: MultiCollateralVault (OUSD · sOUSD demo · tTBILL demo) plus
// the Move exchange's issued supply. Protocol comes from activeAddresses() (crew/V2-SWITCH.md).
import { useId, useState, type ReactNode } from "react";
import { useConnection } from "wagmi";
import { Activity, ChevronDown, Gauge, Layers, PlusCircle, ShieldAlert } from "lucide-react";
import { explorerAddress } from "@mercado/shared";
import { BigNumber, ListPane, Panel, Row, Rows, SectionLabel, SettingsLayout } from "@/components/console";
import { ConnectGate } from "@/components/shell/connect-gate";
import { Badge } from "@/components/ui/badge";
import { MintScreen } from "@/components/vault/mint-screen";
import {
  PROTOCOL,
  useActivityFeed,
  useCollateralBook,
  useExchangeState,
  useMyPositions,
  useOracle,
  useThreeBuckets,
  type CollateralBookRow,
} from "@/lib/contracts";
import { fmtAmount, fmtBps } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Stagger, TickerText } from "@/lib/motion";
import { Button } from "@/components/ui/button";
import { RatioMeter } from "@/components/vault/ratio-meter";
import { ActivityTable } from "./activity-table";
import { useMintMeta } from "./use-mint-meta";

type Section = "overview" | "positions" | "issue" | "risk" | "activity";
const x = (v: bigint | undefined, unit = "xMXN") => (v === undefined ? "…" : `${fmtAmount(v)} ${unit}`);
const pct = (num?: bigint, den?: bigint) => (num === undefined || !den ? undefined : Number((num * 10_000n) / den) / 100);

function Bar({ value, max = 100, warn }: { value?: number; max?: number; warn?: number }) {
  const v = value === undefined ? 0 : Math.min(100, (value / max) * 100);
  return (
    <div className="bg-muted h-1.5 w-full overflow-hidden rounded-full" aria-hidden>
      <div
        className="h-full rounded-full transition-[width] duration-150"
        style={{ width: `${v}%`, background: warn !== undefined && value !== undefined && value >= warn ? "var(--warning)" : "var(--accent, currentColor)" }}
      />
    </div>
  );
}

function DemoBadge({ r }: { r: Pick<CollateralBookRow, "demo" | "symbol"> }) {
  return r.demo ? <Badge variant="mock">Demo token</Badge> : r.symbol === "OUSD" ? <Badge variant="mock">Testnet</Badge> : null;
}

/** tTBILL / mIDX: admin-priced demo assets with no desk obligation to buy back what a liquidation seizes. */
const DEMO_RWA = (symbol: string) => /^(tTBILL|mIDX)/.test(symbol);
function DemoOnlyNote({ symbol }: { symbol: string }) {
  return DEMO_RWA(symbol) ? (
    <span data-honesty className="text-muted-foreground block text-xs">
      Demo-only collateral: seized tokens have no automatic desk buyback right
    </span>
  ) : null;
}

/** Rows with the hover sweep; each row keeps its hairline (the wrapper carries it). No entrance of their own:
 *  the Panel around them owns the arrival (review V5-TASTE #3, one entrance owner). */
function SweepRows({ children }: { children: ReactNode[] }) {
  return (
    <div className="grid">
      {children.map((c, i) => (
        <div key={i} className="mx-sweep border-b last:border-b-0 [&>div]:border-b-0">
          {c}
        </div>
      ))}
    </div>
  );
}

/** One narrow, factual strip: each collateral's share of the value backing Mint's xMXN (live prices). */
function CollateralStrip({ book }: { book: ReturnType<typeof useCollateralBook> }) {
  const total = book.totalValueXmxn;
  const parts =
    total === undefined || total === 0n || book.rows.some((r) => r.valueXmxn === undefined)
      ? undefined
      : book.rows
          .map((r) => ({ symbol: r.symbol, demo: r.demo, value: r.valueXmxn ?? 0n, share: Number(((r.valueXmxn ?? 0n) * 10_000n) / total) / 100 }))
          .sort((a, b) => b.share - a.share);
  // shades of the product accent, strongest first (no invented chart colors)
  const shade = (i: number) => `color-mix(in oklab, var(--accent) ${[100, 72, 50, 34, 22, 14][Math.min(i, 5)]}%, var(--background))`;
  return (
    <section className="grid gap-2.5" aria-label="What backs Mint's xMXN">
      <span className="meta text-muted-foreground">What backs Mint&apos;s xMXN · collateral value at live prices</span>
      <div
        className="bg-muted flex h-3 w-full rounded-full"
        role="img"
        aria-label={parts ? parts.map((p) => `${p.symbol} ${p.share.toFixed(1)}%`).join(", ") : "Collateral mix loading"}
      >
        {/* v6: hover (or focus) a segment for its token, value and share */}
        {parts?.map((p, i) => {
          // keep the tooltip inside the strip: left-aligned near the start, right-aligned near the end
          const mid = parts.slice(0, i).reduce((t, q) => t + q.share, 0) + p.share / 2;
          const align = mid < 35 ? "left-0" : mid > 65 ? "right-0" : "left-1/2 -translate-x-1/2";
          return (
          <span
            key={p.symbol}
            tabIndex={0}
            className="group relative h-full min-w-1 outline-none first:rounded-l-full last:rounded-r-full focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
            style={{ width: `${p.share}%`, background: shade(i) }}
          >
            <span className={`bg-foreground text-background pointer-events-none absolute bottom-full ${align} z-10 mb-2 translate-y-1 rounded-md px-2.5 py-1.5 text-xs whitespace-nowrap opacity-0 shadow-sm transition-[opacity,transform] duration-200 group-hover:translate-y-0 group-hover:opacity-100 group-focus-visible:translate-y-0 group-focus-visible:opacity-100`}>
              <span className="font-semibold">{p.symbol}</span> · {fmtAmount(p.value, 0)} xMXN · {p.share.toFixed(1)}%
            </span>
          </span>
          );
        })}
      </div>
      <div className="text-muted-foreground flex flex-wrap gap-x-5 gap-y-1 text-[13px]">
        {parts
          ? parts.map((p, i) => (
              <span key={p.symbol} className="inline-flex items-center gap-1.5">
                <span className="inline-block size-2.5 rounded-full" style={{ background: shade(i) }} aria-hidden />
                <span className="text-foreground font-medium">{p.symbol}</span> {p.share.toFixed(1)}%
                {p.demo && <span data-honesty>(demo token)</span>}
              </span>
            ))
          : "—"}
      </div>
    </section>
  );
}

/** One big live figure: meta label, a ticking number in the product color, one plain line. */
function Kpi({ label, value, unit, sub }: { label: string; value: string; unit?: string; sub: ReactNode }) {
  return (
    <div className="grid min-w-0 content-start gap-1.5 border-t pt-3">
      <span className="meta text-muted-foreground">
        {label}
        {unit && <> · {unit}</>}
      </span>
      <p className="display text-product text-[clamp(2rem,2.5vw,3.25rem)] leading-none tabular">
        <TickerText text={value} />
      </p>
      <span className="text-muted-foreground text-[13px] text-pretty">{sub}</span>
    </div>
  );
}

/** Overview (v5): four big live figures, the next actions, one factual collateral strip; the detailed
 *  collateral and supply tables fold away below (review V5-TASTE #10). */
function Overview({ go }: { go: (s: Section) => void }) {
  const book = useCollateralBook();
  const buckets = useThreeBuckets();
  const [open, setOpen] = useState(false);
  const detailId = useId();
  const supply = buckets.xmxnSupply;
  const cdp = book.totalDebt;
  const exchange = buckets.move?.liabilityXmxn;
  const cov = buckets.move?.coverageBps;
  const backing = book.totalValueXmxn !== undefined && cdp ? (book.totalValueXmxn * 10_000n) / cdp : undefined;
  return (
    <div className="grid gap-10">
      <Stagger className="grid gap-x-10 gap-y-6 sm:grid-cols-2 xl:grid-cols-4" step={70}>
        <Kpi
          label="xMXN in circulation"
          value={supply === undefined ? "—" : fmtAmount(supply, 0)}
          sub={`${x(cdp)} minted against collateral${PROTOCOL === "v2" ? ` + ${x(exchange)} issued by the exchange` : ""}`}
        />
        <Kpi
          label="Collateral locked"
          value={book.totalValueXmxn === undefined ? "—" : fmtAmount(book.totalValueXmxn, 0)}
          unit="xMXN"
          sub={`${book.rows.length} collaterals at live prices, each in its own position`}
        />
        <Kpi
          label="System backing"
          value={backing === undefined ? "—" : fmtBps(backing, 0)}
          sub="Aggregate CDP coverage; positions have separate liquidation limits"
        />
        {PROTOCOL === "v2" && (
          <Kpi
            label="Exchange coverage"
            value={cov === undefined ? "—" : cov > 10_000_000n ? "∞" : fmtBps(cov, 0)}
            sub={`${x(buckets.move?.reserveOusd, "OUSD")} funded reserve against the exchange's xMXN`}
          />
        )}
      </Stagger>

      <div className="flex flex-wrap gap-3">
        <Button variant="brand" size="lg" className="mx-press text-[var(--on-accent)]" onClick={() => go("issue")}>
          Issue xMXN
        </Button>
        <Button variant="secondary" size="lg" className="mx-press" onClick={() => go("positions")}>
          View your positions
        </Button>
      </div>

      <CollateralStrip book={book} />

      <div className="grid gap-6">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={detailId}
          onClick={() => setOpen((o) => !o)}
          className="mx-press mx-sweep meta text-muted-foreground hover:text-foreground flex items-center justify-between gap-3 border-y py-3 text-left"
        >
          <span>Detail · collateral mix and supply</span>
          <ChevronDown className={cn("size-4 transition-transform duration-300", open && "rotate-180")} aria-hidden />
        </button>
        <div id={detailId} hidden={!open}>
          {open && (
    <div className="grid gap-10 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:gap-14">
      <section className="grid content-start gap-3">
      <SectionLabel index="01">Collateral</SectionLabel>
      <Panel
        title="Collateral mix"
        description={
          PROTOCOL === "v2"
            ? "What institutions have locked to mint xMXN. OUSD is valued at an assumed $1.00 (testnet), sOUSD at its share price, tTBILL at its demo admin price feed; sOUSD and tTBILL are demo tokens."
            : "Testnet OUSD locked in the vault (valued at an assumed $1.00). Multi-collateral issuance is the v2 vault."
        }
      >
        <SweepRows>
          {book.rows.map((r) => {
            const share = pct(r.valueXmxn, book.totalValueXmxn);
            const ceilingUse = r.debtCeiling ? pct(r.debt, r.debtCeiling) : undefined;
            return (
              <Row
                key={r.token}
                label={
                  <span className="flex flex-wrap items-center gap-2">
                    <a href={explorerAddress(r.token)} target="_blank" rel="noreferrer" className="font-medium hover:underline">
                      {r.symbol}
                    </a>
                    <DemoBadge r={r} />
                  </span>
                }
                sub={
                  <span className="grid gap-1.5 pt-1">
                    <span>
                      {x(r.collateral, r.symbol)} locked · ${r.usdPx8 === undefined ? "…" : (Number(r.usdPx8) / 1e8).toFixed(2)} each · mint ≥{" "}
                      {r.mintRatioBps ? fmtBps(r.mintRatioBps, 0) : "…"} · liquidation &lt; {r.liqRatioBps ? fmtBps(r.liqRatioBps, 0) : "…"}
                      {r.mintPaused ? " · minting paused" : ""}
                    </span>
                    <Bar value={share} />
                    <DemoOnlyNote symbol={r.symbol} />
                    {r.debtCeiling !== undefined && (
                      <span>
                        Debt {x(r.debt)} of {x(r.debtCeiling)} ceiling ({ceilingUse === undefined ? "…" : `${ceilingUse.toFixed(1)}%`})
                      </span>
                    )}
                  </span>
                }
                value={
                  <span className="grid justify-items-end">
                    {x(r.valueXmxn)}
                    <span className="text-muted-foreground text-xs font-normal">{share === undefined ? "" : `${share.toFixed(1)}% of collateral`}</span>
                  </span>
                }
              />
            );
          })}
        </SweepRows>
      </Panel>
      </section>

      <section className="grid content-start gap-3">
      <SectionLabel index="02">Supply</SectionLabel>
      <Panel title="Supply" description="Every xMXN in circulation is someone's debt or the exchange's liability.">
        <BigNumber value={supply === undefined ? "…" : <TickerText text={fmtAmount(supply, 0)} />} unit="xMXN" />
        <Rows className="pt-4">
          <Row label="Minted against collateral" sub="Mint (CDP) debt" value={x(cdp)} />
          {PROTOCOL === "v2" && (
            <Row
              label="Issued by the exchange"
              sub={
                buckets.move?.coverageBps === undefined
                  ? "Remesas / Global mints"
                  : `Backed by ${x(buckets.move.reserveOusd, "OUSD")} (${buckets.move.coverageBps > 10_000_000n ? "∞" : fmtBps(buckets.move.coverageBps, 0)} coverage)`
              }
              value={x(exchange)}
            />
          )}
          <Row
            label="Collateral backing"
            sub="Aggregate CDP coverage; positions have separate liquidation limits"
            value={book.totalValueXmxn !== undefined && cdp ? fmtBps((book.totalValueXmxn * 10_000n) / cdp, 0) : "…"}
          />
        </Rows>
      </Panel>
      </section>
    </div>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * v6 Risk gauge: the USD/MXN axis. Today's rate sits in the safe (accent) zone; going left the peso strengthens:
 * the system's aggregate backing reaches the 135% line, then the exchange's coverage reaches 100%.
 */
function FxGauge({ rate, at135, at100 }: { rate?: number; at135?: number; at100?: number }) {
  if (rate === undefined || at135 === undefined) {
    return <div className="bg-muted h-3 w-full animate-pulse rounded-full" aria-label="Risk gauge loading" />;
  }
  const marks = [rate, at135, ...(at100 !== undefined ? [at100] : [])];
  const lo = Math.max(0, Math.floor(Math.min(...marks) * 0.8));
  const hi = Math.ceil(Math.max(...marks) * 1.15);
  const at = (v: number) => `${((v - lo) / (hi - lo)) * 100}%`;
  const move = (1 - at135 / rate) * 100;
  return (
    <figure
      className="grid gap-2"
      aria-label={`USD/MXN today ${rate.toFixed(2)}. System backing reaches 135% at ${at135.toFixed(2)}${
        at100 !== undefined ? `; exchange coverage reaches 100% at ${at100.toFixed(2)}` : ""
      }.`}
    >
      {/* labels above: the 135% line and today */}
      <div className="relative h-11 text-[13px]">
        <span className="absolute bottom-0 grid -translate-x-1/2 justify-items-center" style={{ left: at(at135) }}>
          <span className="text-warning font-semibold tabular">{at135.toFixed(2)}</span>
          <span className="text-muted-foreground whitespace-nowrap">135% line</span>
        </span>
        <span className="absolute bottom-0 grid -translate-x-1/2 justify-items-center" style={{ left: at(rate) }}>
          <span className="text-product font-semibold tabular">
            <TickerText text={rate.toFixed(2)} />
          </span>
          <span className="text-muted-foreground whitespace-nowrap">today</span>
        </span>
      </div>
      <div className="relative h-3 w-full rounded-full">
        <div className="absolute inset-y-0 left-0 rounded-l-full bg-[var(--destructive)]/70" style={{ width: at(at100 ?? lo) }} />
        <div
          className="bg-warning/60 absolute inset-y-0"
          style={{ left: at(at100 ?? lo), width: `calc(${at(at135)} - ${at(at100 ?? lo)})` }}
        />
        <div className="absolute inset-y-0 right-0 rounded-r-full bg-[var(--accent)]/80" style={{ left: at(at135) }} />
        <span className="bg-foreground absolute -top-1 h-5 w-0.5 -translate-x-1/2" style={{ left: at(at135) }} aria-hidden />
        <span
          className="border-background absolute top-1/2 size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 bg-[var(--accent)] shadow transition-[left] duration-500"
          style={{ left: at(rate) }}
          aria-hidden
        />
      </div>
      {/* label below: the exchange's 100% point */}
      <div className="relative h-9 text-[13px]">
        {at100 !== undefined && (
          <span className="absolute top-0 grid -translate-x-1/2 justify-items-center" style={{ left: at(at100) }}>
            <span className="text-destructive font-semibold tabular">{at100.toFixed(2)}</span>
            <span className="text-muted-foreground whitespace-nowrap">exchange 100%</span>
          </span>
        )}
      </div>
      <figcaption className="text-muted-foreground text-[13px]">
        USD/MXN. The peso would have to strengthen {move.toFixed(0)}% for the system to reach its 135% line.
      </figcaption>
    </figure>
  );
}

/** Risk: live coverage, haircuts, redemption bucket and FX breakpoints; liquidations from real event logs. */
function Risk() {
  const book = useCollateralBook();
  const ex = useExchangeState();
  const fx = useOracle();
  const liqs = useActivityFeed("mint").rows.filter((r) => r.event === "Liquidated").slice(0, 5);
  const rate = fx.rate;
  const backingBps = book.totalValueXmxn !== undefined && book.totalDebt ? (book.totalValueXmxn * 10_000n) / book.totalDebt : undefined;
  // FX at which a ratio scales to a target (ratios scale linearly with MXN per USD for USD collateral)
  const fxAt = (nowBps?: bigint, targetBps = 10_000) =>
    nowBps === undefined || rate === undefined || nowBps === 0n ? undefined : (rate * targetBps) / Number(nowBps);
  const v2 = ex.protocol === "v2";
  const cov = v2 ? (ex as { coverageBps?: bigint }).coverageBps : undefined;
  const covShown = cov === undefined ? "…" : cov > 10_000_000n ? "∞ (nothing issued)" : fmtBps(cov, 0);
  const covBreak = cov !== undefined && cov < 10_000_000n ? fxAt(cov) : undefined;
  const backBreak = fxAt(backingBps, 13_500);
  const e2 = ex as { reserveOusd?: bigint; bucketUsedOusd?: bigint; bucketCapOusd?: bigint; depthUsd?: bigint };
  const redeemNow =
    e2.reserveOusd === undefined || e2.bucketUsedOusd === undefined || e2.bucketCapOusd === undefined
      ? undefined
      : (() => {
          const left = e2.bucketCapOusd > e2.bucketUsedOusd ? e2.bucketCapOusd - e2.bucketUsedOusd : 0n;
          return left < e2.reserveOusd ? left : e2.reserveOusd;
        })();
  return (
    <div className="grid gap-12">
      {/* one big idea first: how far the peso would have to move */}
      <section className="grid gap-6 sm:grid-cols-2">
        <div className="grid content-start gap-2">
          <SectionLabel index="01">Exchange coverage</SectionLabel>
          <BigNumber className="text-product" value={<TickerText text={covShown} />} />
          <p className="text-muted-foreground max-w-md text-[15px]">
            Falls to 100% only at <span className="text-foreground font-semibold">{covBreak === undefined ? "—" : `${covBreak.toFixed(2)} MXN/USD`}</span>.
          </p>
        </div>
        <div className="grid content-start gap-2">
          <SectionLabel index="02">System backing</SectionLabel>
          <BigNumber className="text-product" value={backingBps === undefined ? "…" : <TickerText text={fmtBps(backingBps, 0)} />} />
          <p className="text-muted-foreground max-w-md text-[15px]">Aggregate CDP coverage; positions have separate liquidation limits.</p>
        </div>
      </section>
      <FxGauge rate={rate} at135={backBreak} at100={covBreak} />
      <div className="grid gap-10 lg:grid-cols-2 lg:gap-14">
      <section className="grid content-start gap-3">
      <SectionLabel index="03">Exchange balance sheet</SectionLabel>
      <Panel
        title={v2 ? "Exchange backing (Move)" : "Swap desk inventory"}
        description={
          v2
            ? "xMXN issued by the exchange is backed by its own OUSD reserve, never by Mint collateral. When coverage drops below 100%, minting stops and redemptions pay pro rata."
            : "v1 uses a separately seeded, capped swap desk."
        }
      >
        <Rows>
          {v2 ? (
            <>
              <Row label="Funded reserve" sub="OUSD the exchange actually holds" value={x(e2.reserveOusd, "OUSD")} />
              <Row
                label="Available to redeem now"
                sub="Redemption capacity left in the rolling bucket, capped by the reserve"
                value={x(redeemNow, "OUSD")}
              />
              <Row label="Issued xMXN" sub="The exchange's liability" value={x((ex as { liabilityXmxn?: bigint }).liabilityXmxn)} />
              <Row label="Equity buffer" sub="First-loss OUSD, adds reserve without liability" value={x((ex as { equityOusd?: bigint }).equityOusd, "OUSD")} />
              <Row label="Coverage" sub="reserve × FX ÷ issued" value={covShown} />
              <Row
                label="Virtual pricing depth, not reserves"
                sub="Sets the size spread on the oracle mid: a pricing parameter, no funds behind it"
                value={x(e2.depthUsd, "USD")}
              />
              <Row
                label="Redemptions, rolling 24h"
                sub={`Leaky bucket: up to ${(ex as { redeemCapBps?: bigint }).redeemCapBps === undefined ? "…" : fmtBps((ex as { redeemCapBps?: bigint }).redeemCapBps, 0)} of the reserve at once, refilling over 24h`}
                value={`${x((ex as { bucketUsedOusd?: bigint }).bucketUsedOusd, "OUSD")} / ${x((ex as { bucketCapOusd?: bigint }).bucketCapOusd, "OUSD")}`}
              />
              <Row
                label="Coverage hits 100% at"
                sub="USD/MXN if the peso strengthens this far"
                value={(() => {
                  const f = cov !== undefined && cov < 10_000_000n ? fxAt(cov) : undefined;
                  return f === undefined ? "—" : `${f.toFixed(2)} MXN/USD`;
                })()}
              />
            </>
          ) : (
            <>
              <Row label="OUSD" value={x((ex as { reserveOusd?: bigint }).reserveOusd, "OUSD")} />
              <Row label="xMXN" value={x((ex as { reserveXmxn?: bigint }).reserveXmxn)} />
            </>
          )}
        </Rows>
      </Panel>
      </section>

      <section className="grid content-start gap-3">
      <SectionLabel index="04">Haircuts</SectionLabel>
      <Panel title="Collateral haircuts" description="Each collateral has its own mint line (max loan-to-value), liquidation line and penalty.">
        <Rows>
          {book.rows.map((r) => (
            <Row
              key={r.token}
              label={
                <span className="flex items-center gap-2">
                  {r.symbol} <DemoBadge r={r} />
                </span>
              }
              sub={
                <>
                  {`Liquidation below ${r.liqRatioBps ? fmtBps(r.liqRatioBps, 0) : "…"} · penalty ${r.penaltyBps ? fmtBps(r.penaltyBps, 0) : "…"}`}
                  <DemoOnlyNote symbol={r.symbol} />
                </>
              }
              value={r.mintRatioBps ? `max LTV ${((10_000 / r.mintRatioBps) * 100).toFixed(0)}%` : "…"}
            />
          ))}
          <Row
            label="System backing"
            sub="Aggregate CDP coverage; positions have separate liquidation limits"
            value={backingBps === undefined ? "…" : fmtBps(backingBps, 0)}
          />
          <Row
            label="Backing hits 135% at"
            sub="USD/MXN if the peso strengthens (OUSD-valued collateral scales with FX)"
            value={(() => {
              const f = fxAt(backingBps, 13_500);
              return f === undefined ? "—" : `${f.toFixed(2)} MXN/USD`;
            })()}
          />
        </Rows>
      </Panel>
      </section>
      </div>

      <section className="grid gap-3">
        <SectionLabel index="05">Stress tests</SectionLabel>
        <Panel
          title="Stress tests on-chain"
          description="Each stress run shocks the admin-relayed rate (forceSet), liquidates a dedicated position at the new rate, then restores the real rate. These rows are the real liquidations."
        >
          {liqs.length === 0 ? (
            <p className="text-muted-foreground py-4 text-sm">No liquidations yet in this protocol.</p>
          ) : (
            <Rows>
              {liqs.map((r) => (
                <Row
                  key={`${r.txHash}-${r.logIndex}`}
                  label={r.label}
                  sub={
                    <a href={r.url} target="_blank" rel="noreferrer" className="underline underline-offset-2">
                      {r.txHash.slice(0, 10)}… on the explorer
                    </a>
                  }
                  value={`${fmtAmount(r.amount)} xMXN covered · ${fmtAmount(r.amountOut ?? 0n)} ${r.tokenOut} seized`}
                />
              ))}
            </Rows>
          )}
        </Panel>
      </section>
    </div>
  );
}

function Positions() {
  const { positions, open, isLoading } = useMyPositions();
  const book = useCollateralBook();
  // each collateral's own risk lines (same "recommended = mint line + 50%" rule as the collateral picker)
  const linesFor = (token: string) => {
    const r = book.rows.find((b) => b.token.toLowerCase() === token.toLowerCase());
    return r?.liqRatioBps && r.mintRatioBps
      ? { liqBps: BigInt(r.liqRatioBps), minBps: BigInt(r.mintRatioBps), recommendedBps: BigInt(r.mintRatioBps) + 5_000n }
      : undefined;
  };
  return (
    <Panel title="Your positions" description="One independent position per collateral. A shock to one never liquidates another.">
      <ConnectGate persona="lp" why="Connect the institution's wallet to see its positions.">
        {isLoading ? (
          <p className="text-muted-foreground py-4 text-sm">Reading positions…</p>
        ) : open.length === 0 ? (
          <p className="text-muted-foreground py-4 text-sm">No open positions yet. Use Issue &amp; manage to deposit collateral and mint.</p>
        ) : (
          <SweepRows>
            {positions
              .filter((p) => open.includes(p))
              .map((p) => (
                <Row
                  key={p.token}
                  label={
                    <span className="flex items-center gap-2">
                      {p.symbol} <DemoBadge r={p} />
                      {p.isLiquidatable && <Badge variant="destructive">Liquidatable</Badge>}
                    </span>
                  }
                  sub={
                    <span className="grid w-full max-w-md gap-2 pt-1 sm:min-w-[20rem]">
                      <span>
                        {x(p.collateral, p.symbol)} locked · can mint {x(p.maxMintable)} more
                      </span>
                      {/* v6: the position's health as a bar against its own liquidation / mint / recommended lines */}
                      {p.ratioBps !== undefined && p.ratioBps !== null && linesFor(p.token) && (
                        <RatioMeter bps={p.ratioBps} lines={linesFor(p.token)} />
                      )}
                    </span>
                  }
                  value={
                    <span className="grid justify-items-end">
                      {x(p.debt)}
                      <span className="text-muted-foreground text-xs font-normal">
                        ratio {p.ratioBps === null ? "∞ (no debt)" : p.ratioBps === undefined ? "unavailable" : fmtBps(p.ratioBps, 0)}
                      </span>
                    </span>
                  }
                />
              ))}
          </SweepRows>
        )}
      </ConnectGate>
    </Panel>
  );
}

export function MintDashboard() {
  const [section, setSection] = useState<Section>("overview");
  const { address } = useConnection();
  const { open } = useMyPositions();
  const meta = useMintMeta();

  const items = [
    { id: "overview", label: "Overview", icon: Layers },
    { id: "issue", label: "Issue & manage", icon: PlusCircle },
    { id: "positions", label: "Your positions", icon: Gauge, hint: address ? String(open.length) : undefined },
    { id: "risk", label: "Risk", icon: ShieldAlert },
    { id: "activity", label: "Activity", icon: Activity },
  ];

  return (
    <SettingsLayout
      title="Mercado Mint"
      meta={meta.join(" · ")}
      purpose="Create xMXN against OUSD or yield-bearing collateral."
      list={<ListPane label="Mint sections" items={items} value={section} onChange={(id) => setSection(id as Section)} />}
    >
      {section === "overview" && <Overview go={setSection} />}
      {section === "issue" && <MintScreen embedded />}
      {section === "positions" && (
        <section className="grid gap-3">
          <SectionLabel index="01">Your positions</SectionLabel>
          <Positions />
        </section>
      )}
      {section === "risk" && <Risk />}
      {section === "activity" && (
        // min-w-0 down the grid chain: the table scrolls inside its own overflow box at 390px instead of widening the page
        <section className="grid min-w-0 gap-3 [&>*]:min-w-0">
          <SectionLabel index="01">On-chain activity</SectionLabel>
          <ActivityTable
            kind="mint"
            title="Issuance activity"
            description="Deposits, mints, repayments and liquidations, from the vault's event logs."
          />
        </section>
      )}
    </SettingsLayout>
  );
}
