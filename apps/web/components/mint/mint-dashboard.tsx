"use client";
// Mercado Mint: institutional xMXN issuance dashboard. Every number is a live contract read or an event log.
// v1 (default): OUSD only in CollateralVault. v2: MultiCollateralVault (OUSD · sOUSD demo · tTBILL demo) plus
// the Move exchange's issued supply. Protocol comes from activeAddresses() (crew/V2-SWITCH.md).
import { useState } from "react";
import { useConnection } from "wagmi";
import { Activity, Gauge, Layers, PlusCircle } from "lucide-react";
import { explorerAddress } from "@mercado/shared";
import { BigNumber, ListPane, Panel, Row, Rows, SettingsLayout } from "@/components/console";
import { ConnectGate } from "@/components/shell/connect-gate";
import { Badge } from "@/components/ui/badge";
import { MintScreen } from "@/components/vault/mint-screen";
import { PROTOCOL, useCollateralBook, useFlowTotals, useMyPositions, useThreeBuckets, type CollateralBookRow } from "@/lib/contracts";
import { fmtAmount, fmtBps } from "@/lib/format";
import { ActivityTable } from "./activity-table";

type Section = "overview" | "positions" | "issue" | "activity";
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

function Overview() {
  const book = useCollateralBook();
  const buckets = useThreeBuckets();
  const supply = buckets.xmxnSupply;
  const cdp = book.totalDebt;
  const exchange = buckets.move?.liabilityXmxn;
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <Panel
        title="Collateral mix"
        description={
          PROTOCOL === "v2"
            ? "What institutions have locked to mint xMXN, valued at the live feeds. sOUSD and tTBILL are demo tokens with admin-set yield and prices."
            : "Testnet OUSD locked in the vault (valued at an assumed $1.00). Multi-collateral issuance is the v2 vault."
        }
      >
        <Rows>
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
        </Rows>
      </Panel>

      <Panel title="Supply" description="Every xMXN in circulation is someone's debt or the exchange's liability.">
        <BigNumber value={supply === undefined ? "…" : fmtAmount(supply, 0)} unit="xMXN" />
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
            sub="Collateral value ÷ CDP debt, at live prices"
            value={book.totalValueXmxn !== undefined && cdp ? fmtBps((book.totalValueXmxn * 10_000n) / cdp, 0) : "…"}
          />
        </Rows>
      </Panel>
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
          <Rows>
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
          </Rows>
        )}
      </ConnectGate>
    </Panel>
  );
}

export function MintDashboard() {
  const [section, setSection] = useState<Section>("overview");
  const { address } = useConnection();
  const book = useCollateralBook();
  const buckets = useThreeBuckets();
  const flows = useFlowTotals();
  const { open } = useMyPositions();

  const items = [
    { id: "overview", label: "Overview", icon: Layers },
    { id: "issue", label: "Issue & manage", icon: PlusCircle },
    { id: "positions", label: "Your positions", icon: Gauge, hint: address ? String(open.length) : undefined },
    { id: "activity", label: "Activity", icon: Activity },
  ];

  return (
    <SettingsLayout
      title="Mercado Mint"
      purpose="Institutions mint xMXN against OUSD and yield-bearing collateral. The collateral keeps its own yield."
      kpis={[
        { label: "xMXN in circulation", value: buckets.xmxnSupply === undefined ? "…" : fmtAmount(buckets.xmxnSupply, 0), sub: "live total supply" },
        {
          label: "Collateral locked",
          value: book.totalValueXmxn === undefined ? "…" : fmtAmount(book.totalValueXmxn, 0),
          sub: `xMXN value · ${book.rows.length} collateral${book.rows.length === 1 ? "" : "s"}`,
        },
        { label: "Minted all-time", value: flows.data ? fmtAmount(flows.data.minted, 0) : "…", sub: "from Minted events" },
      ]}
      list={<ListPane label="Mint sections" items={items} value={section} onChange={(id) => setSection(id as Section)} />}
    >
      {section === "overview" && <Overview />}
      {section === "issue" && <MintScreen embedded />}
      {section === "positions" && <Positions />}
      {section === "activity" && (
        <ActivityTable
          kind="mint"
          title="Issuance activity"
          description="Deposits, mints, repayments and liquidations, from the vault's event logs."
        />
      )}
    </SettingsLayout>
  );
}
