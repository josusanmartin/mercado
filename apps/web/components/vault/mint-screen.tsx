"use client";
// Create pesos: lock testnet OUSD in the CollateralVault and mint xMXN against it; repay to burn
// xMXN and withdraw collateral. Projections mirror the vault math; every write is simulated first.
import { useEffect, useMemo, useState } from "react";
import { useConnection } from "wagmi";
import { LIQUIDATION_THRESHOLD_BPS, MIN_MINT_RATIO_BPS, useBalances, useMercado, useOracle, useVaultPosition } from "@/lib/contracts";
import { fmtAmount, fmtBps, toUnits } from "@/lib/format";
import { debtAt, health, HEALTH_COPY, ratioBps } from "@/lib/vault-math";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/shell/page-header";
import { ConnectGate } from "@/components/shell/connect-gate";
import { TokenInput } from "@/components/shell/token-input";
import { TxProgress } from "@/components/shell/tx-progress";
import { Stat, TestnetOusdLabel } from "@/components/shell/labels";
import { useTourPrefill } from "@/components/tour/demo-tour";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FxCard } from "./fx-card";
import { PesoSlider } from "./peso-slider";
import { RatioMeter } from "./ratio-meter";

const strip = (v: bigint) => fmtAmount(v, 2).replace(/,/g, "");

export function MintScreen() {
  const { address } = useConnection();
  const pos = useVaultPosition();
  const bal = useBalances();
  const fx = useOracle();
  const m = useMercado();
  const prefill = useTourPrefill("/mint");

  const [deposit, setDeposit] = useState("");
  const [mint, setMint] = useState("");
  const [repay, setRepay] = useState("");
  const [withdraw, setWithdraw] = useState("");

  // Tour prefill (once per step), and clear inputs when the account changes.
  useEffect(() => {
    if (prefill.deposit) setDeposit(prefill.deposit);
    if (prefill.mint) setMint(prefill.mint);
  }, [prefill.deposit, prefill.mint]);
  useEffect(() => {
    setRepay("");
    setWithdraw("");
  }, [address]);

  const coll = pos.collateral ?? 0n;
  const debt = pos.debt ?? 0n;
  const dep = toUnits(deposit);
  const mnt = toUnits(mint);
  const price = fx.mxnPerUsd;
  const oracleOk = fx.valid === true && !fx.paused;

  const nextColl = coll + dep;
  const nextDebt = debt + mnt;
  const nextBps = price !== undefined ? ratioBps(nextColl, nextDebt, price) : undefined;
  const nowBps = pos.ratioBps;
  const headroom = price !== undefined ? debtAt(nextColl, price, MIN_MINT_RATIO_BPS) - debt : undefined;

  const quick = useMemo(() => {
    if (price === undefined || nextColl === 0n) return [];
    return [
      { label: "250%", bps: 25_000n },
      { label: "200% recommended", bps: 20_000n },
      { label: "150% maximum", bps: 15_000n },
    ]
      .map((q) => ({ ...q, amount: debtAt(nextColl, price, q.bps) - debt }))
      .filter((q) => q.amount > 0n);
  }, [price, nextColl, debt]);

  const overBalance = bal.ousd !== undefined && dep > bal.ousd;
  const belowMin = mnt > 0n && nextBps !== undefined && nextBps !== null && nextBps < MIN_MINT_RATIO_BPS;
  const canMint = mnt === 0n || oracleOk;
  const mintDisabled = m.tx.isBusy || (dep === 0n && mnt === 0n) || overBalance || belowMin || !canMint;
  const mintLabel = dep > 0n && mnt > 0n ? "Deposit and mint" : dep > 0n ? "Deposit OUSD" : "Mint xMXN";

  async function onMint() {
    const ok = dep > 0n && mnt > 0n ? await m.depositAndMint(dep, mnt) : dep > 0n ? await m.deposit(dep) : await m.mint(mnt);
    if (ok) {
      setDeposit("");
      setMint("");
    }
  }

  const rep = toUnits(repay);
  const wd = toUnits(withdraw);
  const repayMax = bal.xmxn !== undefined ? (bal.xmxn < debt ? bal.xmxn : debt) : undefined;
  const afterRepayBps = price !== undefined ? ratioBps(coll, debt - (rep > debt ? debt : rep), price) : undefined;

  return (
    <>
      <PageHeader
        title="Create pesos"
        lede={
          <>
            Lock <TestnetOusdLabel /> in the vault and mint xMXN, a synthetic peso, against it. Every xMXN in circulation is debt from an
            over-collateralized position like this one.
          </>
        }
      />
      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="grid min-w-0 content-start gap-6">
          <Card>
            <CardContent>
              <ConnectGate persona="lp" why="Connect a wallet holding testnet OUSD to open a position.">
                <Tabs defaultValue="mint">
                  <TabsList className="mb-2">
                    <TabsTrigger value="mint">Deposit and mint</TabsTrigger>
                    <TabsTrigger value="repay">Repay and withdraw</TabsTrigger>
                  </TabsList>

                  <TabsContent value="mint" className="grid gap-5">
                    <TokenInput
                      label="Deposit collateral"
                      symbol="OUSD"
                      value={deposit}
                      onChange={setDeposit}
                      max={bal.ousd}
                      maxLabel="Balance"
                      disabled={m.tx.isBusy}
                      hint="Testnet OUSD from the Tempo faucet. It has no real value."
                    />
                    <div className="grid gap-2">
                      <TokenInput
                        label="Mint"
                        symbol="xMXN"
                        value={mint}
                        onChange={setMint}
                        max={headroom !== undefined && headroom > 0n ? headroom : undefined}
                        maxLabel="Up to"
                        disabled={m.tx.isBusy || !oracleOk}
                      />
                      {quick.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                          {quick.map((q) => (
                            <button
                              key={q.label}
                              type="button"
                              disabled={m.tx.isBusy || !oracleOk}
                              onClick={() => setMint(strip(q.amount))}
                              className="hover:border-primary hover:text-primary rounded-full border bg-card px-2.5 py-1 text-xs tabular disabled:opacity-50"
                            >
                              {q.label}: {fmtAmount(q.amount, 0)}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    <Projection
                      label="Ratio after"
                      bps={nextBps}
                      nowBps={nowBps}
                      rows={[
                        ["Collateral", `${fmtAmount(nextColl)} OUSD`],
                        ["Debt", `${fmtAmount(nextDebt)} xMXN`],
                      ]}
                    />
                    {belowMin && (
                      <p className="text-destructive text-sm">
                        That would put you at {fmtBps(nextBps!)}. The vault needs at least 150% to mint; we recommend 200% or more.
                      </p>
                    )}

                    <Button size="lg" className="w-full sm:w-auto sm:justify-self-start" disabled={mintDisabled} onClick={onMint}>
                      {mintLabel}
                    </Button>
                  </TabsContent>

                  <TabsContent value="repay" className="grid gap-5">
                    {debt === 0n && coll === 0n ? (
                      <p className="text-muted-foreground text-sm">No open position yet. Deposit and mint first.</p>
                    ) : (
                      <>
                        <div className="grid gap-2">
                          <TokenInput
                            label="Repay and burn"
                            symbol="xMXN"
                            value={repay}
                            onChange={setRepay}
                            max={repayMax}
                            maxLabel="Up to"
                            disabled={m.tx.isBusy || debt === 0n}
                            hint={
                              debt === 0n
                                ? "No debt to repay."
                                : `Repaid xMXN is burned, shrinking supply. Ratio after: ${fmtBps(afterRepayBps)}.`
                            }
                          />
                          <Button
                            variant="secondary"
                            className="justify-self-start"
                            disabled={m.tx.isBusy || rep === 0n || (repayMax !== undefined && rep > repayMax)}
                            onClick={async () => (await m.repayAndBurn(rep)) && setRepay("")}
                          >
                            Repay and burn
                          </Button>
                        </div>
                        <div className="grid gap-2">
                          <TokenInput
                            label="Withdraw collateral"
                            symbol="OUSD"
                            value={withdraw}
                            onChange={setWithdraw}
                            max={pos.maxWithdrawable}
                            maxLabel="Up to"
                            disabled={m.tx.isBusy}
                            hint={
                              debt > 0n
                                ? "You can withdraw as long as the position stays at 150% or more."
                                : "No debt left, so all collateral can come out."
                            }
                          />
                          <Button
                            variant="secondary"
                            className="justify-self-start"
                            disabled={m.tx.isBusy || wd === 0n || (pos.maxWithdrawable !== undefined && wd > pos.maxWithdrawable)}
                            onClick={async () => (await m.withdrawCollateral(wd)) && setWithdraw("")}
                          >
                            Withdraw OUSD
                          </Button>
                        </div>
                      </>
                    )}
                  </TabsContent>
                </Tabs>
                <TxProgress tx={m.tx} className="mt-5" successNote="Done. Your position is updated." />
              </ConnectGate>
            </CardContent>
          </Card>

          <PesoSlider
            collateral={mnt > 0n || dep > 0n ? nextColl : coll}
            debt={mnt > 0n || dep > 0n ? nextDebt : debt}
            mxnPerUsd={price}
            projected={mnt > 0n || dep > 0n}
          />
        </div>

        <div className="grid content-start gap-6">
          <PositionCard />
          <FxCard />
        </div>
      </div>
    </>
  );
}

function Projection({
  label,
  bps,
  nowBps,
  rows,
}: {
  label: string;
  bps: bigint | null | undefined;
  nowBps: bigint | null | undefined;
  rows: [string, string][];
}) {
  const h = health(bps);
  return (
    <div className="grid gap-3 rounded-lg bg-muted/60 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-sm">{label}</span>
        <span
          className={cn(
            "font-display text-2xl font-semibold tabular",
            h === "liquidatable" || h === "tight" ? "text-destructive" : h === "ok" ? "text-warning-ink" : "text-primary",
          )}
        >
          {bps === undefined ? "—" : fmtBps(bps)}
        </span>
      </div>
      <RatioMeter bps={bps} compareBps={nowBps} />
      <dl className="grid grid-cols-2 gap-2 text-sm">
        {rows.map(([k, v]) => (
          <div key={k}>
            <dt className="text-muted-foreground text-xs">{k}</dt>
            <dd className="tabular font-medium">{v}</dd>
          </div>
        ))}
      </dl>
      <p className="text-muted-foreground text-xs">{HEALTH_COPY[h]}</p>
    </div>
  );
}

export function PositionCard() {
  const pos = useVaultPosition();
  const { isConnected } = useConnection();
  const h = health(pos.ratioBps);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Your vault position</CardTitle>
        <CardDescription>Tracked separately for each wallet</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        {!isConnected ? (
          <p className="text-muted-foreground text-sm">Connect a wallet to see its position.</p>
        ) : (
          <>
            <dl className="grid grid-cols-2 gap-4">
              <Stat label="Collateral locked" value={fmtAmount(pos.collateral)} sub="OUSD" />
              <Stat label="Debt" value={fmtAmount(pos.debt)} sub="xMXN" />
              <Stat
                label="Collateral ratio"
                value={<span className={cn(h === "liquidatable" && "text-destructive")}>{pos.ratioBps === null ? "No debt" : fmtBps(pos.ratioBps)}</span>}
                sub={HEALTH_COPY[h]}
              />
              <Stat label="Can still mint" value={fmtAmount(pos.maxMintable)} sub="xMXN at 150%" />
            </dl>
            {pos.ratioBps !== undefined && pos.ratioBps !== null && <RatioMeter bps={pos.ratioBps} />}
            {pos.isLiquidatable && (
              <p className="text-destructive text-sm">
                Below {Number(LIQUIDATION_THRESHOLD_BPS) / 100}%: anyone can repay part of this debt and take collateral plus a 10% penalty.
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
