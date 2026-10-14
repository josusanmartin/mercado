"use client";
// Mercado Invest (crew/DESIGN-ECOSYSTEM.md §7): the savings phone app beside a Portfolio panel. v2-only:
// sOUSD, tTBILL and the InvestDesk exist only in the v2 deployment, so on v1 the page fails closed.
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
const pct = (bps: bigint | undefined) =>
  bps === undefined ? "…" : `${(Number(bps) / 100).toFixed(2)}%`;

export function InvestScreen() {
  if (
    INVEST.protocol !== "v2" ||
    !INVEST.sOUSD ||
    !INVEST.tTBILL ||
    !INVEST.desk
  )
    return (
      <SettingsLayout
        title="Grow your money"
        purpose="Peso savings, dollar savings and demo T-bills."
      >
        <Panel
          title="Available on v2"
          description="Mercado Invest runs on the v2 contracts (sOUSD, the demo tTBILL and the Invest Desk), and this app is running v1. Nothing here falls back to v1."
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
  const earnedPesos =
    p.pesos.balance !== undefined && net
      ? p.pesos.balance - net.netPesos
      : undefined;
  // R-045: only attribute a return when the holding is fully explained by this wallet's own deposits/trades.
  const dolScoped =
    !!net &&
    p.dollars?.shares !== undefined &&
    p.dollars.shares === net.sharesFromEvents;
  const tbScoped =
    !!net &&
    p.tbill?.balance !== undefined &&
    p.tbill.balance === net.tbillFromEvents;
  const unscoped = (ok: boolean, what: string) =>
    !net
      ? "…"
      : ok
        ? undefined
        : `Unavailable: ${what} moved in or out outside your deposits/trades here`;
  const earnedDolRaw =
    p.dollars?.value !== undefined && net
      ? p.dollars.value - net.netDolares
      : undefined;
  const tbillPnlRaw =
    p.tbill?.value !== undefined && net
      ? p.tbill.value - net.netTbillCost
      : undefined;
  const earnedDol = dolScoped ? earnedDolRaw : undefined;
  const tbillPnl = tbScoped ? tbillPnlRaw : undefined;

  return (
    <SettingsLayout
      title="Grow your money"
      purpose={
        <>
          Three real ways to save on Tempo: lend pesos to the driver-advance
          pool, earn on dollars with sOUSD, or buy a demo tokenized T-bill.
          Returns are variable or demo-sourced, never guaranteed.
          <span className="mt-3 flex flex-wrap gap-2">
            <Badge variant="mock">Demo yield sources on testnet</Badge>
            <Badge variant="mock">tTBILL: not a security</Badge>
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
            <PhoneFrame label="Mercado Invest on Android" accent="#E5A823">
              <PhoneApp />
            </PhoneFrame>
          </ConnectGate>
        </div>

        <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] content-start gap-10">
          <Panel
            title="Portfolio"
            description="Your positions and what they earned since you put money in, computed from your own on-chain deposits, withdrawals and trades."
          >
            <p className="text-muted-foreground pt-2 text-[13px] font-medium">
              Ahorro en pesos · peso savings
            </p>
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
            <p className="text-muted-foreground pt-6 text-[13px] font-medium">
              Ahorro en dólares · sOUSD
            </p>
            <Rows>
              <Row
                label="Value"
                value={v(p.dollars?.value, "OUSD")}
                sub={`${v(p.dollars?.shares, "sOUSD shares")}`}
              />
              <Row
                label="Earned since deposit"
                value={
                  unscoped(dolScoped, "sOUSD shares") ??
                  signed(earnedDol, "OUSD")
                }
                sub={`Source: admin-funded demo yield reserve (${v(p.dollars?.yieldReserve, "OUSD", 0)} left), APR ${pct(p.dollars?.aprBps)}`}
              />
            </Rows>
            <p className="text-muted-foreground pt-6 text-[13px] font-medium">
              T-bills · tTBILL
            </p>
            <Rows>
              <Row
                label="Holding"
                value={v(p.tbill?.balance, "tTBILL", 4)}
                sub={`Worth ${v(p.tbill?.value, "OUSD")} at the feed price`}
              />
              <Row
                label="Sellable to the desk"
                value={v(
                  p.desk?.sellable === undefined ||
                    p.tbill?.balance === undefined
                    ? undefined
                    : p.desk.sellable < p.tbill.balance
                      ? p.desk.sellable
                      : p.tbill.balance,
                  "tTBILL",
                  4,
                )}
                sub="The desk only buys back what this wallet bought there. tTBILL received from others (or seized in a Mint liquidation) can't be sold here."
              />
              <Row
                label="Gain / loss vs cost"
                value={
                  unscoped(tbScoped, "tTBILL (e.g. Mint collateral)") ??
                  signed(tbillPnl, "OUSD")
                }
                sub="Includes the desk's spread. Demo admin price feed, not a security."
              />
              <Row
                label="Use as collateral"
                value={
                  <Link
                    href="/mint"
                    className="text-product font-medium hover:underline"
                  >
                    Mint xMXN against tTBILL →
                  </Link>
                }
              />
            </Rows>
          </Panel>

          <Panel
            title="Invest Desk"
            description="Where T-bills are bought and sold: finite inventory, a small spread around the admin price feed, per-trade cap."
          >
            <Rows>
              <Row
                label="Inventory"
                value={
                  p.desk
                    ? `${v(p.desk.reserveTbill, "tTBILL", 2)} · ${v(p.desk.reserveOusd, "OUSD", 0)}`
                    : "…"
                }
              />
              <Row label="Spread" value={pct(p.desk?.spreadBps)} />
              <Row
                label="Max per trade"
                value={v(p.desk?.maxTradeUsd, "USD", 0)}
              />
              <Row
                label="Status"
                value={
                  p.desk?.paused === undefined
                    ? "…"
                    : p.desk.paused
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
            {!h.data && (
              <p className="text-muted-foreground py-4 text-[15px]">
                {h.isError
                  ? "The chain couldn't be read."
                  : "Reading the chain…"}
              </p>
            )}
            {h.data?.rows.length === 0 && (
              <p className="text-muted-foreground py-4 text-[15px]">
                Nothing yet.
              </p>
            )}
            <Rows>
              {h.data?.rows.slice(0, 12).map((r) => (
                <Row
                  key={`${r.txHash}-${r.logIndex}`}
                  label={r.label}
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
                  value={`${fmtAmount(r.amount, r.symbol === "tTBILL" ? 4 : 2)} ${r.symbol}`}
                />
              ))}
            </Rows>
          </Panel>
        </div>
      </div>
    </SettingsLayout>
  );
}
