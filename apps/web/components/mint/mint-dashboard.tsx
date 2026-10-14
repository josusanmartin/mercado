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
import { Reveal, Stagger, TickerText } from "@/lib/motion";
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

/** Rows that fade up one after another; each row keeps its hairline (the wrapper carries it). */
function StaggerRows({ children }: { children: ReactNode[] }) {
  return (
    <Stagger className="grid">
      {children.map((c, i) => (
        <div key={i} className="mx-sweep border-b last:border-b-0 [&>div]:border-b-0">
          {c}
        </div>
      ))}
    </Stagger>
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

/** Overview (v5): four big live figures first; the collateral mix and supply detail fold away below. */
function Overview() {
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
          unit="xMXN"
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
    <Reveal className="grid gap-10 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:gap-14">
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
        <StaggerRows>
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
        </StaggerRows>
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
    </Reveal>
          )}
        </div>
      </div>
    </div>
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
      <Stagger as="section" className="grid gap-6 sm:grid-cols-2" step={90}>
        <div className="grid content-start gap-2">
          <SectionLabel index="01">Exchange coverage</SectionLabel>
          <BigNumber className="text-product" value={<TickerText text={covShown} />} />
          <p className="text-muted-foreground max-w-md text-[15px]">
            Exchange coverage today. It falls to 100% only if the peso strengthens to{" "}
            <span className="text-foreground font-semibold">{covBreak === undefined ? "—" : `${covBreak.toFixed(2)} MXN/USD`}</span>.
          </p>
        </div>
        <div className="grid content-start gap-2">
          <SectionLabel index="02">System backing</SectionLabel>
          <BigNumber className="text-product" value={backingBps === undefined ? "…" : <TickerText text={fmtBps(backingBps, 0)} />} />
          <p className="text-muted-foreground max-w-md text-[15px]">
            Aggregate CDP coverage; positions have separate liquidation limits. All collateral ÷ all Mint debt reaches the 135% line only at{" "}
            <span className="text-foreground font-semibold">{backBreak === undefined ? "—" : `${backBreak.toFixed(2)} MXN/USD`}</span>.
          </p>
        </div>
      </Stagger>
      <Reveal className="grid gap-10 lg:grid-cols-2 lg:gap-14">
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
      </Reveal>

      <Reveal as="section" className="grid gap-3">
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
      </Reveal>
    </div>
  );
}

function Positions() {
  const { positions, open, isLoading } = useMyPositions();
  return (
    <Panel title="Your positions" description="One independent position per collateral. A shock to one never liquidates another.">
      <ConnectGate persona="lp" why="Connect the institution's wallet to see its positions.">
        {isLoading ? (
          <p className="text-muted-foreground py-4 text-sm">Reading positions…</p>
        ) : open.length === 0 ? (
          <p className="text-muted-foreground py-4 text-sm">No open positions yet. Use Issue &amp; manage to deposit collateral and mint.</p>
        ) : (
          <StaggerRows>
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
                  sub={`${x(p.collateral, p.symbol)} locked · can mint ${x(p.maxMintable)} more · can withdraw ${x(p.maxWithdrawable, p.symbol)}`}
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
          </StaggerRows>
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
      purpose="Institutions mint xMXN against OUSD and yield-bearing collateral. The collateral keeps its own yield."
      list={<ListPane label="Mint sections" items={items} value={section} onChange={(id) => setSection(id as Section)} />}
    >
      {section === "overview" && <Overview />}
      {section === "issue" && <MintScreen embedded />}
      {section === "positions" && (
        <section className="grid gap-3">
          <SectionLabel index="01">Your positions</SectionLabel>
          <Positions />
        </section>
      )}
      {section === "risk" && <Risk />}
      {section === "activity" && (
        <section className="grid gap-3">
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
