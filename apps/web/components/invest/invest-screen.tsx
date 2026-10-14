"use client";
// Mercado Invest (crew/DESIGN-ECOSYSTEM.md §7): the savings phone app beside a Portfolio panel. v2-only:
// sOUSD, the peso savings vault and the Stocks desk exist only in the v2 deployment, so on v1 the page fails closed.
import Link from "next/link";
import { useEffect, useRef } from "react";
import { explorerTx } from "@mercado/shared";
import {
  Panel,
  PhoneFrame,
  Row,
  Rows,
  SettingsLayout,
} from "@/components/console";
import { ConnectGate } from "@/components/shell/connect-gate";
import { PhonePanel } from "@/components/mobile";
import { Honesty } from "@/components/console/present";
import { fmtAmount } from "@/lib/format";
import { useOracle } from "@/lib/contracts";
import { PhoneApp } from "./phone-app";
import { INVEST, useInvestHistory, useInvestPositions } from "./use-invest";
import { useLiveDollars, useLivePesos, type LiveValue } from "./use-live-yield";

const v = (x: bigint | undefined, unit: string, d = 2) =>
  x === undefined ? "…" : `${fmtAmount(x, d)} ${unit}`;
/** "+1.23 xMXN" / "−0.40 OUSD"; anything that rounds to zero at `d` decimals is an unsigned "0.00" (no "−0.00"). */
const signed = (x: bigint | undefined, unit: string, d = 2) => {
  if (x === undefined) return "…";
  const abs = x < 0n ? -x : x;
  if (abs * 2n < 10n ** BigInt(6 - d)) return `${fmtAmount(0n, d)} ${unit}`;
  return `${x < 0n ? "−" : "+"}${fmtAmount(abs, d)} ${unit}`;
};
/** The activity labels are the phone's (Spanish); the desktop console reads English (lead 05:27). */
const EN_LABEL: Record<string, string> = {
  "Depósito · ahorro en dólares": "Deposit · dollar savings",
  "Retiro · ahorro en dólares": "Withdrawal · dollar savings",
  "Depósito · ahorro en pesos": "Deposit · peso savings",
  "Retiro · ahorro en pesos": "Withdrawal · peso savings",
  "Depósito · préstamo a choferes": "Deposit · driver lending",
  "Retiro · préstamo a choferes": "Withdrawal · driver lending",
  "Compra · acciones": "Buy · stocks",
  "Venta · acciones": "Sell · stocks",
  "Compra · T-bills": "Buy · T-bills",
  "Venta · T-bills": "Sell · T-bills",
};
const pct = (bps: bigint | undefined) =>
  bps === undefined ? "…" : `${(Number(bps) / 100).toFixed(2)}%`;

/**
 * "Earned since deposit", live: the vault value at this second (exact accrual) minus what this wallet put in,
 * ticking every 50ms with 8 decimals like the phone (once a second under reduced motion). Written to the DOM
 * directly, so React doesn't re-render 20×/s. `fallback` until the first chain read.
 */
function LiveEarned({
  live,
  base,
  unit,
  fallback,
}: {
  live: LiveValue;
  base: bigint | undefined;
  unit: string;
  fallback: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (base === undefined) return;
    const paint = () => {
      const v = live.at(Date.now() / 1000);
      if (v === undefined || !ref.current) return;
      const e = v - Number(base) / 1e6;
      const abs = Math.abs(e) < 5e-9 ? 0 : e; // no "−0.00000000"
      ref.current.textContent = `${abs < 0 ? "−" : "+"}${Math.abs(abs).toFixed(8)} ${unit}`;
    };
    paint();
    const slow = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const t = setInterval(paint, slow ? 1000 : 50);
    return () => clearInterval(t);
  }, [live, base, unit]);
  return (
    <span ref={ref} className="tabular">
      {fallback}
    </span>
  );
}

const ALLOC_COLOR: Record<string, string> = {
  Dollars: "var(--c-invest)",
  Pesos: "color-mix(in oklab, var(--c-invest) 45%, var(--background))",
  Stocks: "var(--foreground)",
};

/** One stacked bar of where the money sits (USD terms) + a legend with each share. Static: no looping motion. */
function AllocationBar({
  parts,
}: {
  parts: { key: string; usd: number | undefined }[];
}) {
  const known = parts.filter((x) => x.usd !== undefined) as {
    key: string;
    usd: number;
  }[];
  const total = known.reduce((a, x) => a + x.usd, 0);
  const ready = known.length === parts.length;
  return (
    <figure
      className="grid gap-2 pt-2 pb-4"
      aria-label="Allocation by value in US dollars"
    >
      <div className="flex items-baseline justify-between gap-3">
        <span className="meta text-muted-foreground">Allocation</span>
        <span className="tabular text-[15px] font-semibold">
          {ready
            ? `US$${total.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
            : "…"}
        </span>
      </div>
      <div
        className="bg-muted flex h-2.5 w-full overflow-hidden rounded-full"
        role="img"
        aria-label={
          ready && total > 0
            ? parts
                .map(
                  (x) =>
                    `${x.key} ${Math.round(((x.usd ?? 0) / total) * 100)}%`,
                )
                .join(", ")
            : "Loading"
        }
      >
        {ready &&
          total > 0 &&
          known.map((x) => (
            <span
              key={x.key}
              style={{
                width: `${(x.usd / total) * 100}%`,
                background: ALLOC_COLOR[x.key],
              }}
            />
          ))}
      </div>
      <figcaption className="flex flex-wrap gap-x-4 gap-y-1 text-[13px]">
        {parts.map((x) => (
          <span key={x.key} className="inline-flex items-center gap-1.5">
            <span
              aria-hidden
              className="size-2 rounded-full"
              style={{ background: ALLOC_COLOR[x.key] }}
            />
            {x.key}{" "}
            <span className="text-muted-foreground tabular">
              {ready && total > 0 && x.usd !== undefined
                ? `${Math.round((x.usd / total) * 100)}%`
                : "…"}
            </span>
          </span>
        ))}
      </figcaption>
    </figure>
  );
}

export function InvestScreen() {
  if (INVEST.protocol !== "v2" || !INVEST.sOUSD || !INVEST.deskIdx)
    return (
      <SettingsLayout
        title="Grow your money"
        purpose="Save in dollars, pesos or stocks."
      >
        <Panel
          title="Available on v2"
          description="Mercado Invest runs on the v2 contracts (sOUSD, the peso savings vault and the Stocks desk), and this app is running v1. Nothing here falls back to v1."
        >
          <p className="text-muted-foreground py-2 text-[15px]">
            Ask the operator to switch the app to v2, or open the v2 preview.
          </p>
        </Panel>
      </SettingsLayout>
    );
  return <InvestV2 />;
}

function InvestV2() {
  const p = useInvestPositions();
  // exact per-second accrual (StakedOUSD formula), the same source as the phone's ticking counters
  const fx = useOracle();
  const liveDol = useLiveDollars();
  const livePes = useLivePesos();
  const h = useInvestHistory();
  const net = h.data;
  const vault = p.pesosVault; // sxMXN once deployed; until then peso savings is the lending pool
  // R-045: only attribute a return when the holding is fully explained by this wallet's own deposits/trades.
  const dolScoped =
    !!net &&
    p.dollars?.shares !== undefined &&
    p.dollars.shares === net.sharesFromEvents;
  const pesoScoped = vault
    ? !!net &&
      vault.shares !== undefined &&
      vault.shares === net.sxSharesFromEvents
    : true;
  const idxScoped =
    !!net &&
    p.stocks?.balance !== undefined &&
    p.stocks.balance === net.stocksFromEvents;
  const unscoped = (ok: boolean, what: string) =>
    !net
      ? "…"
      : ok
        ? undefined
        : `Unavailable: ${what} moved in or out outside your deposits/trades here`;
  const earnedDol =
    dolScoped && p.dollars?.value !== undefined && net
      ? p.dollars.value - net.netDolares
      : undefined;
  const earnedPesos = vault
    ? pesoScoped && vault.value !== undefined && net
      ? vault.value - net.netPesosVault
      : undefined
    : p.pesos.balance !== undefined && net
      ? p.pesos.balance - net.netPesos
      : undefined;
  const idxPnl =
    idxScoped && p.stocks?.value !== undefined && net
      ? p.stocks.value - net.netStocksCost
      : undefined;
  const activity = net?.rows;
  const sellable =
    p.stocksDesk?.sellable === undefined || p.stocks?.balance === undefined
      ? undefined
      : p.stocksDesk.sellable < p.stocks.balance
        ? p.stocksDesk.sellable
        : p.stocks.balance;

  return (
    <SettingsLayout
      title="Grow your money"
      purpose={
        <>
          Save in dollars (5%) or pesos (8%), earning every second, or buy a
          stocks index.<Honesty> Demo-funded rates, never guaranteed.</Honesty>
        </>
      }
    >
      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[360px_minmax(0,1fr)] lg:gap-10">
        <div className="-mx-4 sm:mx-0">
          <ConnectGate
            persona="saver"
            why="Mercado Invest runs on the saver's wallet. Use the demo account or connect your own."
          >
            <PhoneFrame
              label="Mercado Invest on Android"
              accent="#E5A823"
              onAccent="#0a0a0a"
              statusBar="#E5A823"
            >
              <PhoneApp />
            </PhoneFrame>
          </ConnectGate>
        </div>

        {/* real-phone mode: collapses below the full-screen app (<640px); unchanged on desktop */}
        <PhonePanel className="grid min-w-0 grid-cols-[minmax(0,1fr)] content-start gap-10">
          <Panel
            title="Portfolio"
            description="Your positions and what they earned, from your own on-chain deposits and trades."
          >
            {/* v6 "show, don't tell": one allocation bar + one line per position; the sources sit behind "How it works" */}
            <AllocationBar
              parts={[
                {
                  key: "Dollars",
                  usd:
                    p.dollars?.value === undefined
                      ? undefined
                      : Number(p.dollars.value) / 1e6,
                },
                {
                  key: "Pesos",
                  usd:
                    (vault ? vault.value : p.pesos.balance) === undefined ||
                    !fx.rate
                      ? undefined
                      : Number((vault ? vault.value : p.pesos.balance)!) /
                        1e6 /
                        fx.rate,
                },
                {
                  key: "Stocks",
                  usd:
                    p.stocks?.value === undefined
                      ? undefined
                      : Number(p.stocks.value) / 1e6,
                },
              ]}
            />
            <Rows>
              <Row
                label="Dollar savings"
                value={v(p.dollars?.value, "OUSD")}
                sub={
                  <>
                    {unscoped(dolScoped, "sOUSD shares") ?? (
                      <>
                        {signed(earnedDol, "OUSD", 6)} earned on-chain · now{" "}
                        <LiveEarned
                          live={liveDol}
                          base={net?.netDolares}
                          unit="OUSD"
                          fallback="…"
                        />{" "}
                        projected
                      </>
                    )}{" "}
                    · {pct(p.dollars?.aprBps)} a year
                  </>
                }
              />
              <Row
                label="Peso savings"
                value={v(vault ? vault.value : p.pesos.balance, "xMXN")}
                sub={
                  vault ? (
                    <>
                      {unscoped(pesoScoped, "sxMXN shares") ?? (
                        <>
                          {signed(earnedPesos, "xMXN", 6)} earned on-chain · now{" "}
                          <LiveEarned
                            live={livePes}
                            base={net?.netPesosVault}
                            unit="xMXN"
                            fallback="…"
                          />{" "}
                          projected
                        </>
                      )}{" "}
                      · {pct(vault.aprBps)} a year
                    </>
                  ) : (
                    <>{signed(earnedPesos, "xMXN")} earned · variable</>
                  )
                }
              />
              <Row
                label="Stocks · mIDX"
                value={v(p.stocks?.value, "OUSD")}
                sub={
                  <>
                    {v(p.stocks?.balance, "mIDX", 4)} at{" "}
                    {p.stocks?.px8 === undefined
                      ? "…"
                      : `$${(Number(p.stocks.px8) / 1e8).toFixed(2)}`}{" "}
                    ·{" "}
                    {unscoped(idxScoped, "mIDX (e.g. Mint collateral)") ??
                      signed(idxPnl, "OUSD")}{" "}
                    vs cost
                    {p.stocks?.priceValid === false && (
                      <span className="text-destructive">
                        {" "}
                        · feed STALE: trading refused
                      </span>
                    )}
                  </>
                }
              />
            </Rows>
            <details className="mt-4 text-[13px]">
              <summary className="text-muted-foreground hover:text-foreground cursor-pointer">
                How it works
              </summary>
              <ul className="text-muted-foreground grid gap-2 pt-3">
                <li>
                  <span className="text-foreground font-medium">
                    Dollar savings (sOUSD).
                  </span>{" "}
                  Accrues every second at the configured rate,
                  <Honesty>
                    {" "}
                    paid from an admin-funded demo yield reserve (
                    {v(p.dollars?.yieldReserve, "OUSD", 0)} left). Accrual stops
                    if it runs out.
                  </Honesty>
                </li>
                <li>
                  <span className="text-foreground font-medium">
                    Peso savings ({vault ? "sxMXN" : "lending pool"}).
                  </span>{" "}
                  {vault ? (
                    <>
                      Same vault design over xMXN,
                      <Honesty>
                        {" "}
                        paid from an admin-funded demo yield reserve (
                        {v(vault.yieldReserve, "xMXN", 0)} left).
                      </Honesty>
                    </>
                  ) : (
                    <>
                      Your share of the driver-advance pool; earnings are fees
                      drivers actually paid. Withdrawable now:{" "}
                      {v(p.pesos.withdrawable, "xMXN")} (capped by idle pool
                      cash). Variable, not guaranteed.
                    </>
                  )}
                </li>
                <li>
                  <span className="text-foreground font-medium">
                    Stocks (mIDX).
                  </span>{" "}
                  Bought and sold at the desk around its price feed, spread
                  included. Sellable to the desk: {v(sellable, "mIDX", 4)} (it
                  only buys back what this wallet bought there).
                  <Honesty>
                    {" "}
                    Demo index token with an admin price feed, not a security.
                  </Honesty>{" "}
                  <Link
                    href="/mint"
                    className="text-product font-medium hover:underline"
                  >
                    Mint xMXN against mIDX →
                  </Link>
                </li>
                <li>
                  <span className="text-foreground font-medium">
                    Earned on-chain vs projected.
                  </span>{" "}
                  &quot;Earned on-chain&quot; is your position at the last chain
                  read minus what you put in; &quot;projected&quot; runs the
                  vault&apos;s own accrual formula forward to this second and
                  re-syncs on every read.
                </li>
                <li>
                  The allocation bar converts pesos at the oracle rate (
                  {fx.rate ? `${fx.rate.toFixed(2)} MXN/USD` : "…"}).
                </li>
              </ul>
            </details>
          </Panel>

          <Panel
            title="Stocks desk"
            description="Where mIDX is bought and sold: finite inventory, a small spread around the admin price feed, per-trade cap."
          >
            <Rows>
              <Row
                label="Inventory"
                value={
                  p.stocksDesk
                    ? `${v(p.stocksDesk.reserveIdx, "mIDX", 2)} · ${v(p.stocksDesk.reserveOusd, "OUSD", 0)}`
                    : "…"
                }
              />
              <Row label="Spread" value={pct(p.stocksDesk?.spreadBps)} />
              <Row
                label="Max per trade"
                value={v(p.stocksDesk?.maxTradeUsd, "USD", 0)}
              />
              <Row
                label="Status"
                value={
                  p.stocksDesk?.paused === undefined
                    ? "…"
                    : p.stocksDesk.paused
                      ? "Paused"
                      : "Open"
                }
              />
            </Rows>
          </Panel>

          <Panel
            title="Activity"
            description="Your deposits, withdrawals and trades, read from the chain."
          >
            {!activity && (
              <p className="text-muted-foreground py-4 text-[15px]">
                {h.isError
                  ? "The chain couldn't be read."
                  : "Reading the chain…"}
              </p>
            )}
            {activity?.length === 0 && (
              <p className="text-muted-foreground py-4 text-[15px]">
                Nothing yet.
              </p>
            )}
            <Rows>
              {activity?.slice(0, 12).map((r) => (
                <Row
                  key={`${r.txHash}-${r.logIndex}`}
                  label={EN_LABEL[r.label] ?? r.label}
                  sub={
                    <a
                      href={explorerTx(r.txHash)}
                      target="_blank"
                      rel="noreferrer"
                      className="font-mono hover:underline"
                    >
                      {r.txHash.slice(0, 10)}… ↗
                    </a>
                  }
                  value={`${fmtAmount(r.amount, r.symbol === "tTBILL" || r.symbol === "mIDX" ? 4 : 2)} ${r.symbol}`}
                />
              ))}
            </Rows>
          </Panel>
        </PhonePanel>
      </div>
    </SettingsLayout>
  );
}
