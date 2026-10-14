"use client";
// Mercado Invest (crew/DESIGN-ECOSYSTEM.md §7): the savings phone app beside a Portfolio panel. v2-only:
// sOUSD, the peso savings vault and the Stocks desk exist only in the v2 deployment, so on v1 the page fails closed.
import Link from "next/link";
import { explorerTx } from "@mercado/shared";
import {
  Panel,
  PhoneFrame,
  Row,
  Rows,
  SettingsLayout,
} from "@/components/console";
import { ConnectGate } from "@/components/shell/connect-gate";
import { Badge } from "@/components/ui/badge";
import { PhonePanel } from "@/components/mobile";
import { Honesty } from "@/components/console/present";
import { fmtAmount } from "@/lib/format";
import { PhoneApp } from "./phone-app";
import { INVEST, useInvestHistory, useInvestPositions } from "./use-invest";

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
  const h = useInvestHistory();
  const net = h.data;
  const vault = p.pesosVault; // sxMXN once deployed; until then peso savings is the lending pool
  // R-045: only attribute a return when the holding is fully explained by this wallet's own deposits/trades.
  const dolScoped =
    !!net &&
    p.dollars?.shares !== undefined &&
    p.dollars.shares === net.sharesFromEvents;
  const pesoScoped = vault
    ? !!net && vault.shares !== undefined && vault.shares === net.sxSharesFromEvents
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
          Save in dollars, pesos or stocks on Tempo: dollar and peso savings
          accrue every second at a configured rate, and stocks track a demo US
          equity index.
          <Honesty> Returns come from demo sources and are never guaranteed.</Honesty>
          <span className="mt-3 flex flex-wrap gap-2">
            <Badge variant="mock">Demo yield sources on testnet</Badge>
            <Badge variant="mock">mIDX: demo token, not a security</Badge>
          </span>
        </>
      }
    >
      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[360px_minmax(0,1fr)] lg:gap-10">
        <div className="-mx-4 sm:mx-0">
          <ConnectGate
            persona="saver"
            why="Mercado Invest runs on the saver's wallet. Use the demo account or connect your own."
          >
            <PhoneFrame label="Mercado Invest on Android" accent="#E5A823" onAccent="#0a0a0a" statusBar="#E5A823">
              <PhoneApp />
            </PhoneFrame>
          </ConnectGate>
        </div>

        {/* real-phone mode: collapses below the full-screen app (<640px); unchanged on desktop */}
        <PhonePanel className="grid min-w-0 grid-cols-[minmax(0,1fr)] content-start gap-10">
          <Panel
            title="Portfolio"
            description="Your positions and what they earned since you put money in, computed from your own on-chain deposits, withdrawals and trades."
          >
            <p className="text-muted-foreground pt-2 text-[13px] font-medium">
              Dollar savings · sOUSD
            </p>
            <Rows>
              <Row
                label="Value"
                value={v(p.dollars?.value, "OUSD")}
                sub={`${v(p.dollars?.shares, "sOUSD shares")} · ${pct(p.dollars?.aprBps)} a year, accrued every second`}
              />
              <Row
                label="Earned since deposit"
                value={
                  unscoped(dolScoped, "sOUSD shares") ??
                  signed(earnedDol, "OUSD")
                }
                sub={`Source: admin-funded demo yield reserve (${v(p.dollars?.yieldReserve, "OUSD", 0)} left). Accrual stops if it runs out.`}
              />
            </Rows>

            <p className="text-muted-foreground pt-6 text-[13px] font-medium">
              Peso savings · {vault ? "sxMXN" : "lending pool"}
            </p>
            {vault ? (
              <Rows>
                <Row
                  label="Value"
                  value={v(vault.value, "xMXN")}
                  sub={`${v(vault.shares, "sxMXN shares")} · ${pct(vault.aprBps)} a year, accrued every second`}
                />
                <Row
                  label="Earned since deposit"
                  value={
                    unscoped(pesoScoped, "sxMXN shares") ??
                    signed(earnedPesos, "xMXN")
                  }
                  sub={`Source: admin-funded demo yield reserve (${v(vault.yieldReserve, "xMXN", 0)} left). Accrual stops if it runs out.`}
                />
              </Rows>
            ) : (
              <Rows>
                <Row
                  label="Balance"
                  value={v(p.pesos.balance, "xMXN")}
                  sub="Your share of the pool: principal plus realized fees"
                />
                <Row
                  label="Earned since deposit"
                  value={signed(earnedPesos, "xMXN")}
                  sub="Source: fees drivers actually paid on repaid advances. Variable, not guaranteed."
                />
                <Row
                  label="Withdrawable now"
                  value={v(p.pesos.withdrawable, "xMXN")}
                  sub={`Your claim, capped by idle pool cash (${v(p.pesos.poolCash, "xMXN", 0)} across all lenders); lent funds return as drivers repay`}
                />
              </Rows>
            )}

            <p className="text-muted-foreground pt-6 text-[13px] font-medium">
              Stocks · mIDX (Mercado US Equity Index)
            </p>
            <Rows>
              <Row
                label="Holding"
                value={v(p.stocks?.balance, "mIDX", 4)}
                sub={`Worth ${v(p.stocks?.value, "OUSD")} at ${p.stocks?.px8 === undefined ? "…" : `$${(Number(p.stocks.px8) / 1e8).toFixed(2)}`}${p.stocks?.priceValid === false ? " (feed STALE: trading refused)" : ""}`}
              />
              <Row
                label="Gain / loss vs cost"
                value={
                  unscoped(idxScoped, "mIDX (e.g. Mint collateral)") ??
                  signed(idxPnl, "OUSD")
                }
                sub="Includes the desk's spread. Demo index token with an admin price feed, not a security."
              />
              <Row
                label="Sellable to the desk"
                value={v(sellable, "mIDX", 4)}
                sub="The desk only buys back what this wallet bought there. mIDX received from others (or seized in a Mint liquidation) can't be sold here."
              />
              <Row
                label="Use as collateral"
                value={
                  <Link
                    href="/mint"
                    className="text-product font-medium hover:underline"
                  >
                    Mint xMXN against mIDX →
                  </Link>
                }
              />
            </Rows>
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
