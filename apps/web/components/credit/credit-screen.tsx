"use client";
// Mercado Crédito · Drivers tab body (embedded in the /credito product shell): section tabs (Driver ·
// Credit line · Draw · Your advance) and one plain panel per section.
// Flow: demo driver earnings → explainable score → signed, expiring eligibility → draw xMXN from the
// separately funded CreditPool → manual repayment. Everything mocked is labeled as such.
import { useEffect, useRef, useState } from "react";
import {
  Gauge,
  HandCoins,
  RotateCcw,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import type { Address, Hex } from "viem";
import { useConnection } from "wagmi";
import type { DriverProfileId } from "@mercado/shared";
import {
  BigNumber,
  Panel,
  PanelActions,
  Row,
  Rows,
} from "@/components/console";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  useBalances,
  useBorrowCapacity,
  useMercado,
  usePool,
} from "@/lib/contracts";
import { fmtAmount, toUnits } from "@/lib/format";
import { cn } from "@/lib/utils";
import { TxProgress } from "@/components/shell/tx-progress";
import { EarningsChart } from "./earnings-chart";
import {
  PROFILES,
  bpsToPct,
  useCountdown,
  useDriverDemo,
  useEligibility,
} from "./use-advance";

type Section = "driver" | "offer" | "draw" | "repay";

const DEMO_BADGES = (
  <div className="flex flex-wrap gap-2">
    <Badge variant="mock">Demo Uber Data</Badge>
    <Badge variant="mock">Illustrative, not a credit model</Badge>
  </div>
);

export function CreditScreen() {
  const { address } = useConnection();
  const [section, setSection] = useState<Section>("driver");
  const [profile, setProfile] = useState<DriverProfileId>();
  const demo = useDriverDemo(profile);
  const eligibility = useEligibility();
  const score = eligibility.data;
  // R-014: only use an offer signed for the connected wallet.
  const att =
    score?.attestation &&
    address &&
    score.attestation.borrower.toLowerCase() === address.toLowerCase()
      ? score.attestation
      : undefined;
  const secondsLeft = useCountdown(att?.expiry);
  const expired = secondsLeft === 0;

  const pool = usePool();
  const params = pool; // live feeBps / perUserCap / maxUtilizationBps (R-035)
  const feePct = bpsToPct(params.feeBps);
  const owed = (amount: bigint) =>
    params.feeBps === undefined
      ? undefined
      : amount + (amount * params.feeBps + 9_999n) / 10_000n;
  const balances = useBalances();
  const capacity = useBorrowCapacity(att ? BigInt(att.maxAmount) : undefined);
  // Live on-chain capacity once we have an attestation; the API's snapshot until then.
  const available =
    (capacity.data as bigint | undefined) ??
    (score ? BigInt(score.availableToBorrow) : undefined);

  const drawTx = useMercado();
  const repayTx = useMercado();
  const [drawInput, setDrawInput] = useState("");
  const [repayInput, setRepayInput] = useState("");
  const drawAmount = toUnits(drawInput);
  const repayAmount = toUnits(repayInput);
  // Unknown (loading/RPC failure) is not the same as zero debt: show "—" rather than "0".
  const debtKnown = pool.debt !== undefined;
  const debt = pool.debt ?? 0n;

  const pick = (p: DriverProfileId) => {
    setProfile(p);
    eligibility.reset();
    drawTx.tx.reset();
  };
  const requestOffer = () => {
    if (!address || !profile) return;
    eligibility.mutate({ borrower: address as Address, profile });
    setSection("offer");
  };

  // R-014: an offer is bound to one borrower and its nonce is single-use. Drop it when the wallet changes,
  // and fetch a fresh one after a successful draw so a second draw doesn't hit NonceAlreadyUsed.
  const { reset: resetEligibility, mutate: mutateEligibility } = eligibility;
  useEffect(() => {
    resetEligibility();
  }, [address, resetEligibility]);
  const lastDraw = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (
      drawTx.tx.status !== "success" ||
      !drawTx.tx.hash ||
      lastDraw.current === drawTx.tx.hash
    )
      return;
    lastDraw.current = drawTx.tx.hash;
    setDrawInput("");
    if (address && profile)
      mutateEligibility({ borrower: address as Address, profile });
  }, [drawTx.tx.status, drawTx.tx.hash, address, profile, mutateEligibility]);

  const drawError =
    drawAmount === 0n
      ? undefined
      : available !== undefined && drawAmount > available
        ? `The most you can draw right now is ${fmtAmount(available)} xMXN.`
        : undefined;
  const repayError =
    repayAmount === 0n
      ? undefined
      : repayAmount > debt
        ? `You owe ${fmtAmount(debt)} xMXN.`
        : balances.xmxn !== undefined && repayAmount > balances.xmxn
          ? `You only hold ${fmtAmount(balances.xmxn)} xMXN.`
          : undefined;

  const profileTitle = PROFILES.find((p) => p.id === profile)?.title;
  const items = [
    {
      id: "driver",
      label: "Driver",
      icon: UserRound,
      hint: profileTitle?.split(" ")[0],
    },
    {
      id: "offer",
      label: "Credit line",
      icon: Gauge,
      hint: score
        ? score.eligible
          ? fmtAmount(BigInt(score.maxAmount), 0)
          : "Not eligible"
        : undefined,
    },
    {
      id: "draw",
      label: "Draw",
      icon: HandCoins,
      hint:
        att && !expired && available !== undefined
          ? fmtAmount(available, 0)
          : undefined,
    },
    {
      id: "repay",
      label: "Your advance",
      icon: RotateCcw,
      hint: address && debt > 0n ? fmtAmount(debt, 0) : undefined,
    },
  ];

  // Embedded in Mercado Crédito's shell (which owns the product hero and the tab row): numbered steps,
  // then the panel for the selected step.
  return (
    <div className="grid gap-4">
      <DriverSteps
        items={items.map((it) => ({
          ...it,
          done:
            it.id === "driver"
              ? !!profile
              : it.id === "offer"
                ? !!score
                : it.id === "draw"
                  ? drawTx.tx.status === "success" || debt > 0n
                  : false,
        }))}
        value={section}
        onChange={(id) => setSection(id as Section)}
      />
      {section === "driver" && (
        <Panel
          title="Choose a demo driver"
          description="Synthetic earnings, not real Uber data. A real integration would use driver OAuth with Uber-approved scopes (partner.accounts, partner.trips, partner.payments). We never ask for an Uber password."
          aside={DEMO_BADGES}
        >
          <div className="grid gap-3 py-2 sm:grid-cols-3">
            {PROFILES.map((p) => (
              <button
                key={p.id}
                type="button"
                data-nav-item=""
                onClick={() => pick(p.id)}
                disabled={drawTx.tx.isBusy}
                className={cn(
                  "hover:bg-accent rounded-[12px] border p-4 text-left transition-colors duration-150",
                  profile === p.id && "border-foreground bg-accent",
                )}
              >
                <div className="font-medium">{p.title}</div>
                <div className="text-muted-foreground text-sm">{p.blurb}</div>
              </button>
            ))}
          </div>
          {demo.isLoading && (
            <p className="text-muted-foreground py-4 text-sm">
              Loading demo earnings…
            </p>
          )}
          {demo.data && (
            <>
              <Rows>
                <Row
                  label="Driver"
                  value={demo.data.driver.firstName}
                  sub={`${demo.data.driver.city} · ${demo.data.driver.vehicle}`}
                />
                <Row label="Rating" value={`★ ${demo.data.driver.rating}`} />
                <Row
                  label="Weeks of history"
                  value={demo.data.weeks.length}
                  sub="Demo Uber Data"
                />
              </Rows>
              <div className="pt-4">
                <EarningsChart
                  weeks={demo.data.weeks}
                  median={score?.features.medianWeeklyNetMxn}
                />
              </div>
              <PanelActions>
                {address ? (
                  <Button
                    size="lg"
                    onClick={requestOffer}
                    disabled={eligibility.isPending}
                  >
                    {eligibility.isPending ? "Checking…" : "Check eligibility"}
                  </Button>
                ) : (
                  <p className="text-muted-foreground text-sm">
                    Connect a wallet so the offer can be signed for your
                    address.
                  </p>
                )}
              </PanelActions>
            </>
          )}
        </Panel>
      )}

      {section === "offer" && (
        <Panel
          title="Why you get a credit line"
          description="A fixed rule from median weekly net, earnings volatility, active weeks and trip consistency. These are fake underwriting parameters for a testnet demo."
          aside={DEMO_BADGES}
        >
          {!profile && <Empty>Choose a demo driver first.</Empty>}
          {profile && !score && !eligibility.isPending && (
            <PanelActions>
              <Button size="lg" onClick={requestOffer} disabled={!address}>
                Check eligibility
              </Button>
            </PanelActions>
          )}
          {eligibility.isPending && <Empty>Scoring…</Empty>}
          {eligibility.error && (
            <p className="text-destructive py-2 text-sm">
              {eligibility.error.message}
            </p>
          )}
          {score && (
            <>
              <div className="py-4">
                <p className="text-muted-foreground text-sm">Credit line</p>
                <BigNumber
                  value={
                    score.eligible
                      ? fmtAmount(BigInt(score.maxAmount), 0)
                      : "Not eligible"
                  }
                  unit={score.eligible ? "xMXN" : undefined}
                />
              </div>
              <Rows>
                <Row
                  label="Score"
                  value={`${score.score} / 100`}
                  sub={`Floor ${score.scoreFloor}`}
                />
                <ScoreRow
                  label="Income level"
                  points={score.features.components.income}
                  max={35}
                />
                <ScoreRow
                  label="Earnings stability"
                  points={score.features.components.stability}
                  max={30}
                />
                <ScoreRow
                  label="Active weeks"
                  points={score.features.components.activity}
                  max={20}
                />
                <ScoreRow
                  label="Trip consistency"
                  points={score.features.components.tripConsistency}
                  max={15}
                />
                {score.eligible && (
                  <Row
                    label="Available now"
                    value={
                      available !== undefined
                        ? `${fmtAmount(available, 0)} xMXN`
                        : "—"
                    }
                    sub={`Limited by pool cash, ${bpsToPct(params.maxUtilizationBps) ?? "the pool's"} max utilization, the ${params.perUserCap !== undefined ? `${fmtAmount(params.perUserCap, 0)} xMXN` : ""} per-driver cap and what you already owe`}
                  />
                )}
              </Rows>
              <ul className="text-muted-foreground grid gap-1 pt-4 text-sm">
                {score.explanation.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
              {att && (
                <p className="text-muted-foreground pt-3 text-xs">
                  Signed eligibility (EIP-712) for{" "}
                  <span className="font-mono">{shortHex(att.borrower)}</span> ·
                  nonce{" "}
                  <span className="font-mono">{att.nonce.slice(0, 8)}…</span> ·
                  data hash{" "}
                  <span className="font-mono">{shortHex(att.dataHash)}</span> ·{" "}
                  {expired ? (
                    <span className="text-destructive">expired</span>
                  ) : (
                    `expires in ${fmtClock(secondsLeft)}`
                  )}
                  . Only the hash of the income report goes on-chain.
                </p>
              )}
              <PanelActions>
                {att && !expired && score.eligible && (
                  <Button size="lg" onClick={() => setSection("draw")}>
                    Draw an advance
                  </Button>
                )}
                <Button
                  size="lg"
                  variant="outline"
                  onClick={requestOffer}
                  disabled={eligibility.isPending || drawTx.tx.isBusy}
                >
                  Refresh offer
                </Button>
              </PanelActions>
            </>
          )}
        </Panel>
      )}

      {section === "draw" && (
        <Panel
          title="Draw your advance"
          description={`Paid in xMXN from the credit pool, which lenders fund separately from the peso vault. ${feePct ? `A flat ${feePct} fee` : "The pool's flat fee"} is added to what you owe.`}
        >
          {!att || expired || !score?.eligible ? (
            <Empty>
              {expired
                ? "Your offer expired. Refresh it under Credit line."
                : "Get a credit line first (Driver, then Credit line)."}
            </Empty>
          ) : (
            <>
              <Rows>
                <Row
                  label="Available now"
                  value={`${fmtAmount(available, 0)} xMXN`}
                />
                <Row label="Offer expires in" value={fmtClock(secondsLeft)} />
                <Row
                  label="Amount"
                  value={
                    <div className="flex items-center justify-end gap-2">
                      <Input
                        inputMode="decimal"
                        placeholder="Amount in xMXN"
                        value={drawInput}
                        onChange={(e) => setDrawInput(e.target.value)}
                        className="w-40 text-right"
                      />
                      {available !== undefined && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            setDrawInput(String(Number(available) / 1e6))
                          }
                        >
                          Max
                        </Button>
                      )}
                    </div>
                  }
                />
                {drawAmount > 0n && !drawError && (
                  <Row
                    label="You'll owe"
                    value={
                      owed(drawAmount) !== undefined
                        ? `${fmtAmount(owed(drawAmount))} xMXN`
                        : "Fee unavailable"
                    }
                    sub={`You receive ${fmtAmount(drawAmount)} xMXN`}
                  />
                )}
              </Rows>
              {drawError && (
                <p className="text-destructive pt-2 text-sm">{drawError}</p>
              )}
              <PanelActions>
                <Button
                  size="lg"
                  onClick={() =>
                    drawTx.borrow(drawAmount, {
                      ...att,
                      dataHash: att.dataHash as Hex,
                      signature: att.signature as Hex,
                    })
                  }
                  disabled={
                    drawAmount === 0n || !!drawError || drawTx.tx.isBusy
                  }
                >
                  {drawTx.tx.isBusy ? "Drawing…" : "Draw advance"}
                </Button>
              </PanelActions>
              <div className="pt-3">
                <TxProgress
                  tx={drawTx.tx}
                  successNote="Advance received. A fresh offer was requested for your next draw."
                />
              </div>
            </>
          )}
        </Panel>
      )}

      {section === "repay" && (
        <Panel
          title="Your advance"
          description="Repayment is manual. Nothing is deducted from Uber payouts."
        >
          <div className="py-4">
            <p className="text-muted-foreground text-sm">You owe</p>
            <BigNumber
              value={address && debtKnown ? fmtAmount(debt) : "—"}
              unit="xMXN"
            />
          </div>
          <Rows>
            <Row
              label="Principal"
              value={address ? `${fmtAmount(pool.loanPrincipal)} xMXN` : "—"}
            />
            <Row
              label="Fee"
              value={address ? `${fmtAmount(pool.loanFee)} xMXN` : "—"}
            />
            <Row
              label="Your xMXN balance"
              value={address ? `${fmtAmount(balances.xmxn)} xMXN` : "—"}
            />
            {debt > 0n && (
              <Row
                label="Repay"
                value={
                  <div className="flex items-center justify-end gap-2">
                    <Input
                      inputMode="decimal"
                      placeholder="Amount"
                      value={repayInput}
                      onChange={(e) => setRepayInput(e.target.value)}
                      className="w-40 text-right"
                    />
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setRepayInput(String(Number(debt) / 1e6))}
                    >
                      All
                    </Button>
                  </div>
                }
              />
            )}
          </Rows>
          {repayError && (
            <p className="text-destructive pt-2 text-sm">{repayError}</p>
          )}
          {debt > 0n && (
            <PanelActions>
              <Button
                size="lg"
                onClick={() => repayTx.repayLoan(repayAmount)}
                disabled={
                  repayAmount === 0n || !!repayError || repayTx.tx.isBusy
                }
              >
                {repayTx.tx.isBusy ? "Repaying…" : "Repay"}
              </Button>
            </PanelActions>
          )}
          <div className="pt-3">
            <TxProgress
              tx={repayTx.tx}
              successNote="Repayment recorded on-chain."
            />
          </div>
        </Panel>
      )}
    </div>
  );
}

function ScoreRow({
  label,
  points,
  max,
}: {
  label: string;
  points: number;
  max: number;
}) {
  return (
    <Row
      label={label}
      value={
        <span className="flex items-center justify-end gap-3">
          <span className="bg-muted hidden h-1.5 w-28 overflow-hidden rounded-full sm:block">
            <span
              className="bg-foreground block h-full rounded-full"
              style={{ width: `${(points / max) * 100}%` }}
            />
          </span>
          {points}/{max}
        </span>
      }
    />
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-muted-foreground py-6 text-[15px]">{children}</p>;
}

const shortHex = (h: string) => `${h.slice(0, 6)}…${h.slice(-4)}`;
const fmtClock = (s?: number) =>
  s === undefined
    ? "—"
    : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

type StepItem = {
  id: string;
  label: string;
  icon: LucideIcon;
  hint?: string;
  done: boolean;
};

/** Numbered stepper for the driver journey (not a second tab bar): click any step to open it. */
function DriverSteps({
  items,
  value,
  onChange,
}: {
  items: StepItem[];
  value: string;
  onChange: (id: string) => void;
}) {
  return (
    <ol
      aria-label="Driver steps"
      data-nav="row"
      className="grid grid-cols-2 gap-2 sm:grid-cols-4"
    >
      {items.map((it, i) => {
        const on = it.id === value;
        return (
          <li key={it.id}>
            <button
              type="button"
              data-nav-item=""
              aria-current={on ? "step" : undefined}
              onClick={() => onChange(it.id)}
              className={cn(
                "flex w-full items-center gap-3 rounded-[12px] border p-3 text-left transition-colors duration-150",
                on
                  ? "border-product bg-product-soft"
                  : "bg-card hover:bg-accent",
              )}
            >
              <span
                className={cn(
                  "flex size-7 shrink-0 items-center justify-center rounded-full border text-sm font-semibold",
                  it.done
                    ? "bg-product border-product text-white"
                    : on
                      ? "border-product text-product"
                      : "text-muted-foreground",
                )}
              >
                {it.done ? "✓" : i + 1}
              </span>
              <span className="min-w-0">
                <span className="block text-[15px] font-medium">
                  {it.label}
                </span>
                <span className="text-muted-foreground block truncate text-xs">
                  {it.hint ?? "\u00a0"}
                </span>
              </span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}
