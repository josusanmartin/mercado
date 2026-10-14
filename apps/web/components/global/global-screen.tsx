"use client";
// Mercado Global: B2B MXN↔USD through the exchange (v2 MoveAMM, v1 swap desk until lead flips).
// One header (live KPIs) and one tab row: Pay a supplier · Redeem · Exchange backing · Partner API · Activity.
// Everything is live: quotes from /api/move/quote, execution through lib/contracts, backing from contract
// views, activity from the getLogs indexer, partner calls from the paid-call ledger.
import { useState } from "react";
import { ArrowDownUp, Building2, Landmark, Plug, Receipt } from "lucide-react";
import type { Address } from "viem";
import { isAddress } from "viem";
import { useConnection } from "wagmi";
import type { MoveQuoteResponse } from "@mercado/shared";
import {
  BigNumber,
  ListPane,
  Panel,
  PanelActions,
  Row,
  Rows,
  SettingsLayout,
} from "@/components/console";
import { ConnectGate } from "@/components/shell/connect-gate";
import { TokenInput } from "@/components/shell/token-input";
import { TxProgress } from "@/components/shell/tx-progress";
import { ActivityTable } from "@/components/mint/activity-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { personaById } from "@/components/wallet/personas";
import {
  useBalances,
  useExchangeState,
  useMercado,
} from "@/lib/contracts";
import { fmtAmount, toUnits } from "@/lib/format";
import { PartnerApi } from "./partner-api";
import { useMoveQuote, useSecondsLeft } from "./use-move-quote";

const TABS = [
  { id: "pay", label: "Pay a supplier", icon: Building2 },
  { id: "redeem", label: "Redeem", icon: ArrowDownUp },
  { id: "backing", label: "Exchange backing", icon: Landmark },
  { id: "api", label: "Partner API", icon: Plug },
  { id: "activity", label: "Activity", icon: Receipt },
] as const;
type Tab = (typeof TABS)[number]["id"];

const v = (x: bigint | undefined, unit: string, digits = 2) =>
  x === undefined ? "…" : `${fmtAmount(x, digits)} ${unit}`;
const pct = (bps: bigint | number | undefined) =>
  bps === undefined
    ? "…"
    : `${(Number(bps) / 100).toLocaleString("en-US", { maximumFractionDigits: 2 })}%`;

export function GlobalScreen() {
  const [tab, setTab] = useState<Tab>("pay");

  return (
    <SettingsLayout
      product="global"
      title="Cross-border payments for businesses"
      demo="merchant"
      purpose={
        <>
          Pay Mexican suppliers in pesos from dollars, or bring pesos home,
          through Mercado&apos;s exchange: OUSD in mints xMXN, xMXN out burns
          it. Quotes come from an admin-relayed testnet FX feed.
          <span className="mt-3 flex flex-wrap gap-2">
            <Badge variant="mock">Testnet OUSD · no real value</Badge>
            <Badge variant="mock">xMXN not redeemable for pesos</Badge>
          </span>
        </>
      }
      list={
        <ListPane
          label="Mercado Global"
          items={TABS.map((t) => ({ id: t.id, label: t.label, icon: t.icon }))}
          value={tab}
          onChange={(id) => setTab(id as Tab)}
        />
      }
    >
      {tab === "pay" && <PaySupplier />}
      {tab === "redeem" && <Redeem />}
      {tab === "backing" && <Backing />}
      {tab === "api" && <PartnerApi />}
      {tab === "activity" && (
        <ActivityTable
          kind="move"
          title="Exchange activity"
          description="Every OUSD ↔ xMXN exchange on the active protocol, read live from the chain."
        />
      )}
    </SettingsLayout>
  );
}

/** The quote's numbers as plain rows (rate vs mid, spread split, minimum received, expiry). */
function QuoteRows({
  q,
  secondsLeft,
}: {
  q: MoveQuoteResponse;
  secondsLeft?: number;
}) {
  return (
    <Rows>
      <Row
        label="Rate"
        value={`${q.rate.toLocaleString("en-US", { maximumFractionDigits: 6 })} ${q.symbolOut} per ${q.symbolIn}`}
      />
      <Row
        label="FX mid (oracle)"
        value={`${q.oracleMidRate.toLocaleString("en-US", { maximumFractionDigits: 4 })} MXN/USD`}
        sub={
          q.oracleStale
            ? "STALE: the exchange will refuse to trade"
            : "Admin-relayed testnet feed"
        }
      />
      <Row
        label="Total cost vs mid"
        value={`${q.effectiveSpreadBps.toFixed(2)} bps`}
        sub={`Fee ${q.feeBps.toFixed(2)} bps · size impact ${q.sizeImpactBps.toFixed(2)} bps`}
      />
      <Row label="Fee" value={`${fmtAmount(BigInt(q.fee))} ${q.symbolOut}`} />
      <Row
        label="Minimum received"
        value={`${fmtAmount(BigInt(q.minOutSuggested))} ${q.symbolOut}`}
        sub="Enforced on-chain (0.5% tolerance)"
      />
      <Row
        label="Quote expires in"
        value={
          secondsLeft === undefined
            ? "…"
            : secondsLeft === 0
              ? "expired, refreshing"
              : `${secondsLeft}s`
        }
        sub={`Indicative · ${q.source === "v2-vamm" ? "v2 vault exchange" : "v1 capped swap desk"}`}
      />
    </Rows>
  );
}

function PaySupplier() {
  const { address } = useConnection();
  const bal = useBalances();
  const m = useMercado();
  const [amount, setAmount] = useState("100");
  const [to, setTo] = useState("");
  const [memo, setMemo] = useState("");
  const quote = useMoveQuote("usd_to_mxn", amount);
  const q = quote.data;
  const secondsLeft = useSecondsLeft(q?.expiresAt);
  const amountIn = toUnits(amount);
  const supplier = personaById("recipient");
  const toOk = isAddress(to);
  const insufficient = bal.ousd !== undefined && amountIn > bal.ousd;
  const canPay =
    !!q &&
    secondsLeft !== 0 &&
    toOk &&
    amountIn > 0n &&
    !insufficient &&
    !m.tx.isBusy;

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <Panel
        variant="card"
        title="Pay a supplier in pesos"
        description="You pay OUSD; the supplier receives xMXN at the quoted rate. On v2 the exchange mints straight to the supplier in one transaction; on v1 the desk swaps, then the xMXN is sent with your memo."
      >
        <ConnectGate persona="merchant" why="to pay from the business account">
          <div className="grid gap-4 pt-2">
            <TokenInput
              label="You pay"
              symbol="OUSD"
              value={amount}
              onChange={setAmount}
              max={bal.ousd}
              invalid={insufficient}
            />
            <label className="grid gap-1 text-[15px]">
              <span className="text-muted-foreground">Supplier address</span>
              <Input
                value={to}
                onChange={(e) => setTo(e.target.value.trim())}
                placeholder="0x…"
                className="font-mono"
              />
              {supplier?.address && (
                <button
                  type="button"
                  className="text-product w-fit text-[13px] hover:underline"
                  onClick={() => setTo(supplier.address!)}
                >
                  Use the demo supplier account ({supplier.address.slice(0, 6)}…
                  {supplier.address.slice(-4)})
                </button>
              )}
              {to && !toOk && (
                <span className="text-destructive text-[13px]">
                  Not a valid address.
                </span>
              )}
            </label>
            <label className="grid gap-1 text-[15px]">
              <span className="text-muted-foreground">
                Reference (optional, public on v1)
              </span>
              <Input
                value={memo}
                onChange={(e) => setMemo(e.target.value)}
                maxLength={32}
                placeholder="Invoice 1042"
              />
            </label>
          </div>
          <PanelActions>
            <Button
              size="lg"
              disabled={!canPay}
              onClick={() =>
                q &&
                m.exchangeUsdToMxn(
                  amountIn,
                  BigInt(q.amountOut),
                  to as Address,
                  memo || undefined,
                )
              }
            >
              {m.tx.isBusy
                ? "Paying…"
                : q
                  ? `Pay ${fmtAmount(amountIn)} OUSD → ${fmtAmount(BigInt(q.amountOut))} xMXN`
                  : "Pay supplier"}
            </Button>
          </PanelActions>
          {insufficient && (
            <p className="text-destructive pt-2 text-[13px]">
              The business account holds {fmtAmount(bal.ousd)} OUSD.
            </p>
          )}
          <TxProgress
            tx={m.tx}
            className="mt-4"
            successNote="Paid. The supplier's xMXN is on-chain."
          />
        </ConnectGate>
      </Panel>

      <Panel
        title="Indicative quote"
        description="Live from the exchange at this size. For a quote signed by Mercado (cotización indicativa firmada), use the Partner API."
      >
        {!address && (
          <p className="text-muted-foreground pb-2 text-[13px]">
            Quotes don&apos;t need a wallet.
          </p>
        )}
        {quote.isLoading && (
          <p className="text-muted-foreground py-4 text-[15px]">Pricing…</p>
        )}
        {quote.error && (
          <p className="text-destructive py-4 text-[15px]">
            {(quote.error as Error).message}
          </p>
        )}
        {q && (
          <>
            <div className="py-4">
              <p className="text-muted-foreground text-[13px]">
                Supplier receives
              </p>
              <BigNumber
                value={fmtAmount(BigInt(q.amountOut))}
                unit="xMXN"
                className="text-product"
              />
            </div>
            <QuoteRows q={q} secondsLeft={secondsLeft} />
          </>
        )}
      </Panel>
    </div>
  );
}

function Redeem() {
  const bal = useBalances();
  const ex = useExchangeState();
  const m = useMercado();
  const [amount, setAmount] = useState("500");
  const quote = useMoveQuote("mxn_to_usd", amount);
  const q = quote.data;
  const secondsLeft = useSecondsLeft(q?.expiresAt);
  const amountIn = toUnits(amount);
  const insufficient = bal.xmxn !== undefined && amountIn > bal.xmxn;
  const canRedeem =
    !!q && secondsLeft !== 0 && amountIn > 0n && !insufficient && !m.tx.isBusy;

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <Panel
        variant="card"
        title="Redeem xMXN → OUSD"
        description={
          ex.protocol === "v2"
            ? "The exchange burns your xMXN and pays OUSD from its own reserve. Redemptions only cover xMXN the exchange itself issued, are rate-limited by a 24h bucket, and are refused if they'd push coverage below its floor."
            : "The v1 desk pays OUSD from its finite, owner-seeded inventory at the oracle price minus its spread."
        }
      >
        <ConnectGate
          persona="merchant"
          why="to redeem from the business account"
        >
          <div className="pt-2">
            <TokenInput
              label="You redeem"
              symbol="xMXN"
              value={amount}
              onChange={setAmount}
              max={bal.xmxn}
              invalid={insufficient}
            />
          </div>
          <PanelActions>
            <Button
              size="lg"
              disabled={!canRedeem}
              onClick={() =>
                q && m.exchangeMxnToUsd(amountIn, BigInt(q.amountOut))
              }
            >
              {m.tx.isBusy
                ? "Redeeming…"
                : q
                  ? `Redeem for ${fmtAmount(BigInt(q.amountOut))} OUSD`
                  : "Redeem"}
            </Button>
          </PanelActions>
          {insufficient && (
            <p className="text-destructive pt-2 text-[13px]">
              The business account holds {fmtAmount(bal.xmxn)} xMXN.
            </p>
          )}
          <TxProgress
            tx={m.tx}
            className="mt-4"
            successNote="Redeemed. OUSD is in the business account."
          />
        </ConnectGate>
      </Panel>
      <Panel
        title="Indicative quote"
        description="Live from the exchange at this size."
      >
        {quote.isLoading && (
          <p className="text-muted-foreground py-4 text-[15px]">Pricing…</p>
        )}
        {quote.error && (
          <p className="text-destructive py-4 text-[15px]">
            {(quote.error as Error).message}
          </p>
        )}
        {q && (
          <>
            <div className="py-4">
              <p className="text-muted-foreground text-[13px]">You receive</p>
              <BigNumber
                value={fmtAmount(BigInt(q.amountOut))}
                unit="OUSD"
                className="text-product"
              />
            </div>
            <QuoteRows q={q} secondsLeft={secondsLeft} />
          </>
        )}
      </Panel>
    </div>
  );
}

function Backing() {
  const ex = useExchangeState();
  if (ex.protocol === "v2")
    return (
      <Panel
        title="Exchange backing"
        description="The exchange holds its own OUSD reserve against the xMXN it issued, seeded with contributed capital. It never touches CDP collateral. If the peso strengthens, the xMXN liability is worth more in USD and coverage falls. Each mint is checked against the coverage it would leave after the trade, and redemptions drain a rolling bucket that refills over 24h."
      >
        <Rows>
          <Row label="OUSD reserve" value={v(ex.reserveOusd, "OUSD")} />
          <Row
            label="xMXN liability"
            value={v(ex.liabilityXmxn, "xMXN")}
            sub="xMXN issued by the exchange and still outstanding"
          />
          <Row
            label="Net contributed capital"
            value={v(ex.equityOusd, "OUSD")}
            sub="OUSD added as equity minus withdrawn. A cumulative counter, not today's loss-absorbing buffer: that is reserve minus liability at the current rate."
          />
          <Row
            label="Coverage"
            value={pct(ex.coverageBps)}
            sub={`A mint is refused if post-trade coverage would fall below ${pct(ex.minMintCoverageBps)}`}
          />
          <Row
            label="Redemption bucket (rolling)"
            value={
              ex.bucketUsedOusd === undefined || ex.bucketCapOusd === undefined
                ? "…"
                : `${fmtAmount(ex.bucketUsedOusd)} / ${fmtAmount(ex.bucketCapOusd)} OUSD`
            }
            sub={`Used / capacity. Capacity is ${pct(ex.redeemCapBps)} of the current reserve; usage leaks back out over 24h (continuous refill, not a daily reset)`}
          />
          <Row
            label="Fee"
            value={pct(ex.feeBps)}
            sub={`Depth ${v(ex.depthUsd, "USD", 0)} · max ${v(ex.maxSwapUsd, "USD", 0)} per swap`}
          />
          <Row
            label="Status"
            value={
              ex.paused === undefined ? "…" : ex.paused ? "Paused" : "Open"
            }
          />
        </Rows>
      </Panel>
    );
  return (
    <Panel
      title="Exchange backing (v1 swap desk)"
      description="Until lead switches to v2, cross-border flows use the v1 desk: a separately seeded, capped inventory priced at the oracle minus a spread. It's a demo liquidity source, not a market, and never touches vault collateral."
    >
      <Rows>
        <Row label="OUSD inventory" value={v(ex.reserveOusd, "OUSD")} />
        <Row label="xMXN inventory" value={v(ex.reserveXmxn, "xMXN")} />
        <Row label="Spread" value={pct(ex.feeBps)} />
        <Row label="Max per swap" value={v(ex.maxSwapXmxn, "xMXN", 0)} />
        <Row
          label="Daily cap per address"
          value={v(ex.dailyCapOusd, "OUSD", 0)}
        />
        <Row
          label="Status"
          value={ex.paused === undefined ? "…" : ex.paused ? "Paused" : "Open"}
        />
      </Rows>
    </Panel>
  );
}
