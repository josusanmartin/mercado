"use client";
// Mercado Global: B2B MXN↔USD through the exchange (v2 MoveAMM, v1 swap desk until lead flips).
// One header (live KPIs) and one tab row: Pay a supplier · Redeem · Exchange backing · Partner API · Activity.
// Everything is live: quotes from /api/move/quote, execution through lib/contracts, backing from contract
// views, activity from the getLogs indexer, partner calls from the paid-call ledger.
import { useState } from "react";
import {
  ArrowDownUp,
  Building2,
  Landmark,
  Plug,
  Receipt,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";
import type { Address } from "viem";
import { isAddress } from "viem";
import { useConnection, useReadContracts, useSwitchChain } from "wagmi";
import {
  moveAmmAbi,
  TEMPO_MODERATO_CHAIN_ID,
  type MoveQuoteResponse,
} from "@mercado/shared";
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
import { Honesty } from "@/components/console/present";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { personaById, type PersonaId } from "@/components/wallet/personas";
import { usePersona } from "@/components/wallet/use-persona";
import { WalletDialog } from "@/components/wallet/wallet-menu";
import { useDemoMode } from "@/components/console/demo-mode";
import { SuccessCheck, TickerText } from "@/lib/motion";
import { cn } from "@/lib/utils";
import {
  ADDR,
  CHAIN_ID,
  useBalances,
  useExchangeState,
  useMercado,
} from "@/lib/contracts";
import { fmtAmount, shortAddr, toUnits } from "@/lib/format";
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
          it.
          <Honesty> Quotes come from an admin-relayed testnet FX feed.</Honesty>
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
          q.oracleStale ? (
            "STALE: the exchange will refuse to trade"
          ) : (
            <Honesty>Admin-relayed testnet feed</Honesty>
          )
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

/**
 * Inline account status for an action well (review V5-TASTE #1): the form never swaps for a gate, so its
 * geometry is stable from first paint: the row keeps its height in every state, and once connected it says
 * which account pays (review: a row that collapsed on connect still moved the Pay button on a cold arrival).
 */
function InlineConnect({ persona, why }: { persona: PersonaId; why: string }) {
  const { isConnected, chainId, status, address } = useConnection();
  const { switchTo } = usePersona();
  const { on, setOn } = useDemoMode();
  const { mutate: switchChain } = useSwitchChain();
  const p = personaById(persona);
  if (isConnected && chainId === TEMPO_MODERATO_CHAIN_ID)
    return (
      <p className="text-muted-foreground flex min-h-10 items-center text-[13px]">
        Paying from{" "}
        {p.address && address?.toLowerCase() === p.address.toLowerCase()
          ? p.name
          : "your wallet"}
        {address && ` · ${shortAddr(address)}`}
      </p>
    );
  const connecting = status === "connecting" || status === "reconnecting";
  return (
    <div className="flex min-h-10 flex-wrap items-center gap-x-3 gap-y-2 text-[13px]">
      {isConnected ? (
        <>
          <span className="text-muted-foreground">
            Your wallet is on another network.
          </span>
          <Button
            size="sm"
            variant="outline"
            onClick={() => switchChain({ chainId: TEMPO_MODERATO_CHAIN_ID })}
          >
            Switch to Tempo Moderato
          </Button>
        </>
      ) : on ? (
        <>
          <span className="text-muted-foreground">
            {connecting
              ? "Connecting the demo account…"
              : `Not connected: ${why}.`}
          </span>
          <Button
            pending={connecting}
            size="sm"
            variant="outline"
            disabled={!p.privateKey || connecting}
            onClick={() =>
              switchTo(persona).catch((e) =>
                toast.error(String(e?.message ?? e).split("\n")[0]),
              )
            }
          >
            Use {p.name}
          </Button>
        </>
      ) : (
        <>
          <span className="text-muted-foreground">Not connected: {why}.</span>
          <WalletDialog>
            <Button size="sm" variant="outline">
              <Wallet />
              Connect wallet
            </Button>
          </WalletDialog>
          <Button size="sm" variant="ghost" onClick={() => setOn(true)}>
            Turn on Demo mode
          </Button>
        </>
      )}
    </div>
  );
}

/** The one signature success moment (PRINCIPLES v5): a self-drawing check + the settled amounts. */
function Settled({ label, line }: { label: string; line: string }) {
  return (
    <div className="mt-5 flex items-center gap-3" role="status">
      <SuccessCheck size={40} label={label} className="text-success shrink-0" />
      <p className="text-[15px]">
        <span className="font-semibold">{label}.</span>{" "}
        <span className="tabular">{line}</span>
      </p>
    </div>
  );
}

/** Pay a supplier, money first (review V5-TASTE #5): You pay → Supplier receives → recipient → Pay. */
function PaySupplier() {
  const { isConnected, chainId } = useConnection();
  const bal = useBalances();
  const m = useMercado();
  const ex = useExchangeState();
  const [amount, setAmount] = useState("100");
  const [to, setTo] = useState("");
  const [memo, setMemo] = useState("");
  const [withRef, setWithRef] = useState(false);
  const [paid, setPaid] = useState<{ in: bigint; out: bigint }>();
  const quote = useMoveQuote("usd_to_mxn", amount);
  const q = quote.data;
  const secondsLeft = useSecondsLeft(q?.expiresAt);
  const amountIn = toUnits(amount);
  const supplier = personaById("recipient");
  const toOk = isAddress(to);
  const ready = isConnected && chainId === TEMPO_MODERATO_CHAIN_ID;
  const insufficient = ready && bal.ousd !== undefined && amountIn > bal.ousd;
  const canPay =
    ready &&
    !!q &&
    secondsLeft !== 0 &&
    toOk &&
    amountIn > 0n &&
    !insufficient &&
    !m.tx.isBusy;
  const payId = "pay-amount";

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-8 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,.85fr)]">
      <Panel variant="card">
        <div className="grid grid-cols-[minmax(0,1fr)] gap-4 pt-2">
          {/* You pay: the big editable amount */}
          <div className="grid gap-1">
            <div className="flex items-baseline justify-between gap-2">
              <label
                htmlFor={payId}
                className="text-muted-foreground text-[13px] font-medium"
              >
                You pay
              </label>
              {ready && bal.ousd !== undefined && (
                <button
                  type="button"
                  onClick={() =>
                    setAmount(
                      fmtAmount(bal.ousd!, 6)
                        .replace(/,/g, "")
                        .replace(/\.?0+$/, ""),
                    )
                  }
                  className="text-muted-foreground hover:text-foreground tabular text-xs"
                >
                  Max: {fmtAmount(bal.ousd)}
                </button>
              )}
            </div>
            <div className="flex items-baseline gap-2 border-b pb-1 focus-within:border-foreground">
              <input
                id={payId}
                inputMode="decimal"
                autoComplete="off"
                placeholder="0.00"
                value={amount}
                aria-label="You pay (OUSD)"
                size={1}
                aria-invalid={insufficient || undefined}
                onChange={(e) =>
                  setAmount(e.target.value.replace(/[^\d.,]/g, ""))
                }
                className={cn(
                  "tabular w-full min-w-0 flex-1 bg-transparent text-[2.5rem] leading-tight font-semibold outline-none",
                  insufficient && "text-destructive",
                )}
              />
              <span className="text-muted-foreground text-[14px] font-medium">
                OUSD
              </span>
            </div>
          </div>

          {/* one fixed-height line for: not enough balance / quote error / pricing / the live quote */}
          <p
            className="tabular text-muted-foreground min-h-10 text-[13px] sm:min-h-5"
            aria-live="polite"
          >
            {insufficient ? (
              <span className="text-destructive">
                The business account holds {fmtAmount(bal.ousd)} OUSD.
              </span>
            ) : quote.formatError ? (
              <span className="text-destructive">{quote.formatError}</span>
            ) : !quote.valid ? (
              "Enter an amount"
            ) : quote.error ? (
              <span className="text-destructive">
                {(quote.error as Error).message}
              </span>
            ) : q ? (
              <>
                {q.rate.toLocaleString("en-US", { maximumFractionDigits: 4 })}{" "}
                xMXN per OUSD · cost {(q.effectiveSpreadBps / 100).toFixed(2)}%
                vs mid ·{" "}
                {secondsLeft === 0
                  ? "refreshing"
                  : `expires in ${secondsLeft ?? "…"}s`}
              </>
            ) : (
              "Pricing…"
            )}
          </p>

          {/* Supplier receives: the big quoted amount */}
          <div className="grid gap-1">
            <p className="text-muted-foreground text-[13px] font-medium">
              Supplier receives
            </p>
            <p className="flex items-baseline gap-2">
              <span className="text-product tabular text-[2.5rem] leading-tight font-semibold">
                {q ? <TickerText text={fmtAmount(BigInt(q.amountOut))} /> : "—"}
              </span>
              <span className="text-muted-foreground text-[14px] font-medium">
                xMXN
              </span>
            </p>
            <p className="text-muted-foreground min-h-5 text-[13px]">
              {q
                ? `At least ${fmtAmount(BigInt(q.minOutSuggested))} xMXN, enforced on-chain`
                : " "}
            </p>
          </div>

          {/* recipient */}
          <div className="grid gap-1">
            <label
              htmlFor="pay-to"
              className="text-muted-foreground text-[13px] font-medium"
            >
              Supplier address
            </label>
            <Input
              id="pay-to"
              value={to}
              onChange={(e) => setTo(e.target.value.trim())}
              placeholder="0x…"
              className="font-mono"
            />
            <div className="flex min-h-5 flex-wrap items-center gap-x-4 text-[13px]">
              {to && !toOk ? (
                <span className="text-destructive">Not a valid address.</span>
              ) : (
                supplier?.address && (
                  <button
                    type="button"
                    className="text-product hover:underline"
                    onClick={() => setTo(supplier.address!)}
                  >
                    Use demo supplier ({supplier.address.slice(0, 6)}…
                    {supplier.address.slice(-4)})
                  </button>
                )
              )}
              {!withRef && (
                <button
                  type="button"
                  className="text-muted-foreground hover:text-foreground"
                  onClick={() => setWithRef(true)}
                >
                  Add reference
                </button>
              )}
            </div>
            {withRef && (
              <Input
                aria-label="Reference (optional, public on v1)"
                value={memo}
                onChange={(e) => setMemo(e.target.value)}
                maxLength={32}
                placeholder="Reference, e.g. Invoice 1042"
                autoFocus
              />
            )}
          </div>

          <InlineConnect
            persona="merchant"
            why="pay from the business account"
          />
        </div>

        <PanelActions>
          <Button
            size="lg"
            className="h-auto min-h-16 max-w-full py-2 whitespace-normal sm:min-h-12"
            pending={m.tx.isBusy}
            disabled={!canPay}
            onClick={() => {
              if (!q) return;
              setPaid({ in: amountIn, out: BigInt(q.amountOut) });
              m.exchangeUsdToMxn(
                amountIn,
                BigInt(q.amountOut),
                to as Address,
                memo || undefined,
              );
            }}
          >
            {m.tx.isBusy
              ? "Paying…"
              : q
                ? `Pay ${fmtAmount(amountIn)} OUSD → ${fmtAmount(BigInt(q.amountOut))} xMXN`
                : "Pay supplier"}
          </Button>
        </PanelActions>
        {m.tx.status === "success" && paid && (
          <Settled
            label="Paid"
            line={`${fmtAmount(paid.in)} OUSD → ${fmtAmount(paid.out)} xMXN`}
          />
        )}
        <TxProgress
          tx={m.tx}
          className="mt-4"
          successNote="Paid. The supplier's xMXN is on-chain."
        />

        <details className="mt-5 text-[13px]">
          <summary className="text-muted-foreground hover:text-foreground cursor-pointer">
            How this payment settles
          </summary>
          <p className="text-muted-foreground mt-2 max-w-prose">
            You pay OUSD; the supplier receives xMXN at the quoted rate.{" "}
            {ex.protocol === "v2"
              ? "On v2 the exchange mints straight to the supplier in one transaction, and your reference travels in the transfer memo."
              : "On v1 the desk swaps, then the xMXN is sent with your memo."}{" "}
            The quote is indicative: only the minimum received is binding.
          </p>
        </details>
      </Panel>

      <Panel
        title="Quote details"
        description="Live from the exchange at this size. For a quote signed by Mercado (cotización indicativa firmada), use the Partner API."
      >
        <div className="min-h-[22rem]">
          {quote.isLoading && (
            <p className="text-muted-foreground py-4 text-[15px]">Pricing…</p>
          )}
          {quote.error && (
            <p className="text-destructive py-4 text-[15px]">
              {(quote.error as Error).message}
            </p>
          )}
          {q && <QuoteRows q={q} secondsLeft={secondsLeft} />}
        </div>
      </Panel>
    </div>
  );
}

function Redeem() {
  const bal = useBalances();
  const ex = useExchangeState();
  const m = useMercado();
  const [amount, setAmount] = useState("500");
  const [done, setDone] = useState<{ in: bigint; out: bigint }>();
  const quote = useMoveQuote("mxn_to_usd", amount);
  const q = quote.data;
  const secondsLeft = useSecondsLeft(q?.expiresAt);
  const amountIn = toUnits(amount);
  const insufficient = bal.xmxn !== undefined && amountIn > bal.xmxn;
  const canRedeem =
    !!q && secondsLeft !== 0 && amountIn > 0n && !insufficient && !m.tx.isBusy;

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
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
              className="h-auto min-h-12 max-w-full py-2 whitespace-normal"
              pending={m.tx.isBusy}
              disabled={!canRedeem}
              onClick={() => {
                if (!q) return;
                setDone({ in: amountIn, out: BigInt(q.amountOut) });
                m.exchangeMxnToUsd(amountIn, BigInt(q.amountOut));
              }}
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
          {m.tx.status === "success" && done && (
            <Settled
              label="Redeemed"
              line={`${fmtAmount(done.in)} xMXN → ${fmtAmount(done.out)} OUSD`}
            />
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
        {quote.formatError && (
          <p className="text-destructive py-4 text-[15px]">
            {quote.formatError}
          </p>
        )}
        {quote.isLoading && quote.valid && (
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

/** Size impact (bps) of a USD→MXN swap at US$1,000 and at the per-swap max, read from MoveAMM.quote. */
function useSizeSpread(maxSwapUsd: bigint | undefined) {
  const at = [1_000_000_000n, ...(maxSwapUsd ? [maxSwapUsd] : [])];
  const q = useReadContracts({
    contracts: at.map((amount) => ({
      address: ADDR.vamm,
      abi: moveAmmAbi,
      functionName: "quote",
      args: [true, amount],
      chainId: CHAIN_ID,
    })) as never,
    query: { refetchInterval: 30_000 },
  });
  const bps = (i: number) => {
    const r = q.data?.[i] as
      { status: string; result?: readonly bigint[] } | undefined;
    return r?.status === "success" ? r.result![3] : undefined;
  };
  return { at1k: bps(0), atMax: maxSwapUsd ? bps(1) : undefined };
}

function Backing() {
  const ex = useExchangeState();
  const spread = useSizeSpread(
    ex.protocol === "v2" ? ex.maxSwapUsd : undefined,
  );
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
            sub={`Max ${v(ex.maxSwapUsd, "USD", 0)} per swap`}
          />
          <Row
            label="Size spread"
            value={
              spread.at1k === undefined
                ? "…"
                : `~${pct(spread.at1k)} at US$1,000`
            }
            sub={`${spread.atMax === undefined ? "…" : pct(spread.atMax)} at the US$${ex.maxSwapUsd === undefined ? "…" : fmtAmount(ex.maxSwapUsd, 0)} max. Larger swaps price further from the oracle mid on a virtual curve: a pricing parameter, not funded liquidity.`}
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
