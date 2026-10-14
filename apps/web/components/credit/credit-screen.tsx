"use client";
// "Get an advance": demo driver earnings → explainable score → signed, expiring eligibility → draw xMXN
// from the separately funded CreditPool → manual repayment. Everything mocked is labeled as such.
import { useEffect, useMemo, useRef, useState } from "react";
import type { Address, Hex } from "viem";
import { useConnection } from "wagmi";
import type { DriverProfileId } from "@mercado/shared";
import { PageHeader } from "@/components/shell/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  useBalances,
  useBorrowCapacity,
  useMercado,
  usePool,
} from "@/lib/contracts";
import { fmtAmount, toUnits } from "@/lib/format";
import { EarningsChart } from "./earnings-chart";
import { TxStatus } from "./tx-status";
import {
  PROFILES,
  useCountdown,
  useDriverDemo,
  useEligibility,
} from "./use-advance";

const FEE_BPS = 200n; // CreditPool borrow fee, added to debt at draw time

export function CreditScreen() {
  const { address } = useConnection();
  const [profile, setProfile] = useState<DriverProfileId>();
  const demo = useDriverDemo(profile);
  const eligibility = useEligibility();
  const score = eligibility.data;
  const att =
    score?.attestation &&
    address &&
    score.attestation.borrower.toLowerCase() === address.toLowerCase()
      ? score.attestation
      : undefined;
  const secondsLeft = useCountdown(att?.expiry);
  const expired = secondsLeft === 0;

  const pool = usePool();
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
  const debt = pool.debt ?? 0n;

  const check = (p: DriverProfileId) => {
    setProfile(p);
    eligibility.reset();
    drawTx.tx.reset();
  };
  const requestOffer = () =>
    address &&
    profile &&
    eligibility.mutate({ borrower: address as Address, profile });

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

  const median = useMemo(() => score?.features.medianWeeklyNetMxn, [score]);
  const drawError =
    drawAmount === 0n
      ? undefined
      : available !== undefined && drawAmount > available
        ? `Max you can draw right now is ${fmtAmount(available)} xMXN.`
        : undefined;
  const repayError =
    repayAmount === 0n
      ? undefined
      : repayAmount > debt
        ? `Your debt is ${fmtAmount(debt)} xMXN.`
        : balances.xmxn !== undefined && repayAmount > balances.xmxn
          ? `You only hold ${fmtAmount(balances.xmxn)} xMXN.`
          : undefined;

  return (
    <div>
      <PageHeader
        title="Get an advance"
        lede="A small xMXN cash-flow advance against your driving income, repaid manually."
        aside={
          <div className="flex flex-wrap gap-2">
            <Badge variant="mock">Demo Uber Data</Badge>
            <Badge variant="mock">Illustrative score, not a credit model</Badge>
          </div>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="grid gap-6">
          {/* 1. Connect demo driver */}
          <Card>
            <CardHeader>
              <CardTitle>1 · Connect a demo driver</CardTitle>
              <CardDescription>
                Synthetic earnings, not real Uber data. A real integration would
                use driver OAuth with Uber-approved scopes (partner.accounts,
                partner.trips, partner.payments). We never ask for your Uber
                password.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4">
              <div className="grid gap-2 sm:grid-cols-3">
                {PROFILES.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => check(p.id)}
                    disabled={drawTx.tx.isBusy}
                    className={`rounded-lg border p-3 text-left transition-colors hover:bg-muted ${profile === p.id ? "border-primary ring-1 ring-primary" : ""}`}
                  >
                    <div className="font-medium">{p.title}</div>
                    <div className="text-xs text-muted-foreground">
                      {p.blurb}
                    </div>
                  </button>
                ))}
              </div>
              {demo.isLoading && (
                <p className="text-sm text-muted-foreground">
                  Loading demo earnings…
                </p>
              )}
              {demo.data && (
                <div className="grid gap-3">
                  <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
                    <span>
                      <span className="font-medium">
                        {demo.data.driver.firstName}
                      </span>{" "}
                      · {demo.data.driver.city} · {demo.data.driver.vehicle} · ★{" "}
                      {demo.data.driver.rating}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {demo.data.disclaimer}
                    </span>
                  </div>
                  <EarningsChart weeks={demo.data.weeks} median={median} />
                </div>
              )}
            </CardContent>
          </Card>

          {/* 2. Eligibility */}
          {profile && (
            <Card>
              <CardHeader>
                <CardTitle>2 · Why you get a credit line</CardTitle>
                <CardDescription>
                  Deterministic rule from median weekly net, earnings
                  volatility, active weeks and trip consistency. These are fake
                  underwriting parameters for a testnet demo.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4">
                {!address ? (
                  <p className="text-sm text-muted-foreground">
                    Connect a wallet so the offer can be signed for your
                    address.
                  </p>
                ) : !score ? (
                  <Button
                    onClick={requestOffer}
                    disabled={eligibility.isPending}
                    className="w-fit"
                  >
                    {eligibility.isPending ? "Scoring…" : "Check eligibility"}
                  </Button>
                ) : null}
                {eligibility.error && (
                  <p className="text-sm text-destructive">
                    {eligibility.error.message}
                  </p>
                )}
                {score && (
                  <>
                    <div className="grid gap-3 sm:grid-cols-3">
                      <Stat
                        label="Score"
                        value={`${score.score} / 100`}
                        hint={`floor ${score.scoreFloor}`}
                      />
                      <Stat
                        label="Credit line"
                        value={
                          score.eligible
                            ? `${fmtAmount(BigInt(score.maxAmount), 0)} xMXN`
                            : "Not eligible"
                        }
                        hint={
                          score.eligible
                            ? score.capReason === "absolute-cap"
                              ? "1,500 MXN ceiling"
                              : "15% of median weekly net"
                            : undefined
                        }
                      />
                      <Stat
                        label="Available now"
                        value={
                          available !== undefined && score.eligible
                            ? `${fmtAmount(available, 0)} xMXN`
                            : "—"
                        }
                        hint="pool cash, 80% utilization and what you already owe"
                      />
                    </div>
                    <ScoreBars components={score.features.components} />
                    <ul className="grid gap-1 text-sm">
                      {score.explanation.map((line) => (
                        <li key={line} className="flex gap-2">
                          <span className="text-muted-foreground">•</span>
                          <span>{line}</span>
                        </li>
                      ))}
                    </ul>
                    {att && (
                      <p className="text-xs text-muted-foreground">
                        Signed eligibility (EIP-712) for{" "}
                        {shortHex(att.borrower)} · nonce {att.nonce.slice(0, 8)}
                        … · data hash {shortHex(att.dataHash)} ·{" "}
                        {expired ? (
                          <span className="text-destructive">expired</span>
                        ) : (
                          `expires in ${fmtClock(secondsLeft)}`
                        )}
                        . Only the hash of your income report goes on-chain.
                      </p>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={requestOffer}
                      disabled={eligibility.isPending || drawTx.tx.isBusy}
                      className="w-fit"
                    >
                      {eligibility.isPending ? "Refreshing…" : "Refresh offer"}
                    </Button>
                  </>
                )}
              </CardContent>
            </Card>
          )}

          {/* 3. Draw */}
          {att && !expired && score?.eligible && (
            <Card>
              <CardHeader>
                <CardTitle>3 · Draw your advance</CardTitle>
                <CardDescription>
                  Paid in xMXN from the credit pool (funded by lenders, separate
                  from the peso vault). A flat 2% fee is added to what you owe.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Input
                    inputMode="decimal"
                    placeholder="Amount in xMXN"
                    value={drawInput}
                    onChange={(e) => setDrawInput(e.target.value)}
                    className="max-w-48"
                  />
                  {available !== undefined && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        setDrawInput(String(Number(available) / 1e6))
                      }
                    >
                      Max {fmtAmount(available, 0)}
                    </Button>
                  )}
                  <Button
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
                </div>
                {drawAmount > 0n && !drawError && (
                  <p className="text-sm text-muted-foreground">
                    You receive {fmtAmount(drawAmount)} xMXN and will owe{" "}
                    {fmtAmount(
                      drawAmount + (drawAmount * FEE_BPS + 9_999n) / 10_000n,
                    )}{" "}
                    xMXN.
                  </p>
                )}
                {drawError && (
                  <p className="text-sm text-destructive">{drawError}</p>
                )}
                <TxStatus tx={drawTx.tx} />
              </CardContent>
            </Card>
          )}
        </div>

        {/* Right rail: your advance + lender side */}
        <div className="grid min-w-0 content-start gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Your advance</CardTitle>
              <CardDescription>
                Repayment is manual. Nothing is deducted from Uber payouts.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3">
              <Row
                label="You owe"
                value={address ? `${fmtAmount(debt)} xMXN` : "—"}
              />
              <Row
                label="  principal"
                value={address ? `${fmtAmount(pool.loanPrincipal)} xMXN` : "—"}
                muted
              />
              <Row
                label="  fee"
                value={address ? `${fmtAmount(pool.loanFee)} xMXN` : "—"}
                muted
              />
              <Row
                label="Your xMXN balance"
                value={address ? `${fmtAmount(balances.xmxn)} xMXN` : "—"}
              />
              {debt > 0n && (
                <div className="grid gap-2">
                  <div className="flex gap-2">
                    <Input
                      inputMode="decimal"
                      placeholder="Repay amount"
                      value={repayInput}
                      onChange={(e) => setRepayInput(e.target.value)}
                    />
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setRepayInput(String(Number(debt) / 1e6))}
                    >
                      All
                    </Button>
                  </div>
                  <Button
                    variant="secondary"
                    onClick={() => repayTx.repayLoan(repayAmount)}
                    disabled={
                      repayAmount === 0n || !!repayError || repayTx.tx.isBusy
                    }
                  >
                    {repayTx.tx.isBusy ? "Repaying…" : "Repay"}
                  </Button>
                  {repayError && (
                    <p className="text-sm text-destructive">{repayError}</p>
                  )}
                  <TxStatus tx={repayTx.tx} />
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Lender side</CardTitle>
              <CardDescription>
                The pool is funded by lenders&apos; xMXN deposits, separate from
                the vault and the swap desk.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-2">
              <Row
                label="Pool cash available"
                value={`${fmtAmount(pool.available, 0)} xMXN`}
              />
              <Row
                label="Loans out"
                value={`${fmtAmount(pool.outstanding, 0)} xMXN`}
              />
              <Row
                label="Lender claims"
                value={`${fmtAmount(pool.totalAssets, 0)} xMXN`}
              />
              <Row
                label="Realized fees"
                value={`${fmtAmount(pool.realizedFees)} xMXN`}
              />
              <p className="text-xs text-muted-foreground">
                No guaranteed yield. Testnet prototype.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-lg border p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-lg font-semibold tabular-nums">{value}</div>
      {hint && <div className="text-xs text-muted-foreground">{hint}</div>}
    </div>
  );
}

function Row({
  label,
  value,
  muted,
}: {
  label: string;
  value: string;
  muted?: boolean;
}) {
  return (
    <div
      className={`flex justify-between gap-3 text-sm ${muted ? "text-muted-foreground" : ""}`}
    >
      <span className="whitespace-pre">{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}

const MAX_POINTS = {
  income: 35,
  stability: 30,
  activity: 20,
  tripConsistency: 15,
} as const;
const LABELS = {
  income: "Income level",
  stability: "Earnings stability",
  activity: "Active weeks",
  tripConsistency: "Trip consistency",
} as const;

function ScoreBars({
  components,
}: {
  components: Record<keyof typeof MAX_POINTS, number>;
}) {
  return (
    <div className="grid gap-2">
      {(Object.keys(MAX_POINTS) as (keyof typeof MAX_POINTS)[]).map((k) => (
        <div
          key={k}
          className="grid grid-cols-[130px_1fr_56px] items-center gap-2 text-sm"
        >
          <span className="text-muted-foreground">{LABELS[k]}</span>
          <div className="h-2 rounded-full bg-muted">
            <div
              className="h-2 rounded-full bg-primary"
              style={{ width: `${(components[k] / MAX_POINTS[k]) * 100}%` }}
            />
          </div>
          <span className="text-right tabular-nums">
            {components[k]}/{MAX_POINTS[k]}
          </span>
        </div>
      ))}
    </div>
  );
}

const shortHex = (h: string) => `${h.slice(0, 6)}…${h.slice(-4)}`;
const fmtClock = (s?: number) =>
  s === undefined
    ? "—"
    : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
