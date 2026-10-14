"use client";
// Create pesos (console Settings layout): lock testnet OUSD in the CollateralVault and mint xMXN against
// it; repay to burn and withdraw. Projections mirror the vault math; every write is simulated first.
import { useEffect, useMemo, useState } from "react";
import { useConnection } from "wagmi";
import { Activity, ArrowDownToLine, ArrowUpFromLine, Gauge, LineChart } from "lucide-react";
import { MIN_MINT_RATIO_BPS, useBalances, useMercado, useOracle, useVaultPosition } from "@/lib/contracts";
import { fmtAmount, fmtBps, fmtNumber, timeAgo, toUnits } from "@/lib/format";
import { debtAt, health, HEALTH_COPY, ratioBps } from "@/lib/vault-math";
import { useNow } from "@/lib/use-now";
import { BigNumber, ListPane, Panel, PanelActions, Row, Rows, SettingsLayout } from "@/components/console";
import { ConnectGate } from "@/components/shell/connect-gate";
import { TokenInput } from "@/components/shell/token-input";
import { TxProgress } from "@/components/shell/tx-progress";
import { MockOracleBadge } from "@/components/shell/labels";
import { useTourPrefill } from "@/components/tour/demo-tour";
import { Button } from "@/components/ui/button";
import { PesoStress } from "./peso-slider";
import { RatioMeter } from "./ratio-meter";

type Section = "mint" | "repay" | "position" | "fx" | "stress";
const strip = (v: bigint) => fmtAmount(v, 2).replace(/,/g, "");

export function MintScreen() {
  const { address } = useConnection();
  const pos = useVaultPosition();
  const bal = useBalances();
  const fx = useOracle();
  const m = useMercado();
  const prefill = useTourPrefill("/mint");
  const now = useNow(5_000);
  const [section, setSection] = useState<Section>("mint");

  const [deposit, setDeposit] = useState("");
  const [mint, setMint] = useState("");
  const [repay, setRepay] = useState("");
  const [withdraw, setWithdraw] = useState("");

  useEffect(() => {
    if (prefill.deposit) setDeposit(prefill.deposit);
    if (prefill.mint) setMint(prefill.mint);
    if (prefill.deposit || prefill.mint) setSection("mint");
  }, [prefill.deposit, prefill.mint]);
  useEffect(() => {
    setRepay("");
    setWithdraw("");
  }, [address]);

  const loaded = pos.collateral !== undefined && pos.debt !== undefined;
  const coll = pos.collateral ?? 0n;
  const debt = pos.debt ?? 0n;
  const dep = toUnits(deposit);
  const mnt = toUnits(mint);
  const price = fx.mxnPerUsd;
  const oracleOk = fx.valid === true && !fx.paused;
  const h = health(pos.ratioBps);

  const nextColl = coll + dep;
  const nextDebt = debt + mnt;
  const nextBps = price !== undefined ? ratioBps(nextColl, nextDebt, price) : undefined;
  const headroom = price !== undefined ? debtAt(nextColl, price, MIN_MINT_RATIO_BPS) - debt : undefined;
  const drafting = dep > 0n || mnt > 0n;

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
  const mintDisabled = m.tx.isBusy || !loaded || !drafting || overBalance || belowMin || (mnt > 0n && !oracleOk);
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

  const items = [
    { id: "mint", label: "Deposit and mint", icon: ArrowDownToLine },
    { id: "repay", label: "Repay and withdraw", icon: ArrowUpFromLine },
    { id: "position", label: "Your position", icon: Gauge, hint: loaded ? (debt > 0n ? fmtBps(pos.ratioBps, 0) : "None") : undefined },
    { id: "fx", label: "Exchange rate", icon: LineChart, hint: fx.rate !== undefined ? fmtNumber(fx.rate, 2) : undefined },
    { id: "stress", label: "Peso stress test", icon: Activity },
  ];

  return (
    <SettingsLayout title="Create pesos" list={<ListPane label="Create pesos sections" items={items} value={section} onChange={(id) => setSection(id as Section)} />}>
      {section === "mint" && (
        <Panel
          key="mint"
          title="Deposit and mint"
          description="Lock Testnet OUSD (Tempo faucet, no real value) and mint xMXN, a synthetic peso, against it. Every xMXN in circulation is debt from a position like this."
        >
          <ConnectGate persona="lp" why="Connect a wallet holding testnet OUSD to open a position.">
            <div className="grid gap-5 pt-2">
              <TokenInput label="Deposit collateral" symbol="OUSD" value={deposit} onChange={setDeposit} max={bal.ousd} maxLabel="Balance" disabled={m.tx.isBusy} />
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
                  <div data-nav="row" className="flex flex-wrap gap-2">
                    {quick.map((q) => (
                      <button
                        key={q.label}
                        type="button"
                        data-nav-item=""
                        disabled={m.tx.isBusy || !oracleOk}
                        onClick={() => setMint(strip(q.amount))}
                        className="bg-secondary rounded-full px-3.5 py-1.5 text-sm tabular disabled:opacity-50"
                      >
                        {q.label}: {fmtAmount(q.amount, 0)}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <Rows>
                <Row label="Collateral after" value={`${fmtAmount(nextColl)} OUSD`} />
                <Row label="Debt after" value={`${fmtAmount(nextDebt)} xMXN`} />
                <Row
                  label="Ratio after"
                  sub={HEALTH_COPY[health(nextBps)]}
                  value={<span className={belowMin ? "text-destructive" : undefined}>{nextBps === undefined ? "—" : fmtBps(nextBps)}</span>}
                />
              </Rows>
              {drafting && <RatioMeter bps={nextBps} compareBps={pos.ratioBps} />}
              {belowMin && (
                <p className="text-destructive text-sm">
                  That would put you at {fmtBps(nextBps!)}. The vault needs at least 150% to mint; we recommend 200% or more.
                </p>
              )}
              {!oracleOk && fx.valid !== undefined && <p className="text-destructive text-sm">Minting is blocked while the exchange rate is stale or paused.</p>}
              <PanelActions>
                <Button size="lg" disabled={mintDisabled} onClick={onMint}>
                  {mintLabel}
                </Button>
              </PanelActions>
              <TxProgress tx={m.tx} successNote="Done. Your position is updated." />
            </div>
          </ConnectGate>
        </Panel>
      )}

      {section === "repay" && (
        <Panel key="repay" title="Repay and withdraw" description="Repaid xMXN is burned, shrinking supply. Collateral can come out while the position stays at 150% or more.">
          <ConnectGate persona="lp" why="Connect the wallet that holds the position.">
            {!loaded ? (
              <p className="text-muted-foreground py-4 text-sm">Reading your position…</p>
            ) : debt === 0n && coll === 0n ? (
              <p className="text-muted-foreground py-4 text-sm">No open position yet. Deposit and mint first.</p>
            ) : (
              <div className="grid gap-6 pt-2">
                <div className="grid gap-3">
                  <TokenInput
                    label="Repay and burn"
                    symbol="xMXN"
                    value={repay}
                    onChange={setRepay}
                    max={repayMax}
                    maxLabel="Up to"
                    disabled={m.tx.isBusy || debt === 0n}
                    hint={debt === 0n ? "No debt to repay." : `Ratio after: ${fmtBps(afterRepayBps)}.`}
                  />
                  <Button
                    size="lg"
                    variant="outline"
                    className="sm:justify-self-start sm:min-w-56"
                    disabled={m.tx.isBusy || rep === 0n || (repayMax !== undefined && rep > repayMax)}
                    onClick={async () => (await m.repayAndBurn(rep)) && setRepay("")}
                  >
                    Repay and burn
                  </Button>
                </div>
                <div className="grid gap-3">
                  <TokenInput
                    label="Withdraw collateral"
                    symbol="OUSD"
                    value={withdraw}
                    onChange={setWithdraw}
                    max={pos.maxWithdrawable}
                    maxLabel="Up to"
                    disabled={m.tx.isBusy}
                    hint={debt > 0n ? "Only what keeps you at 150% or more." : "No debt left, so all collateral can come out."}
                  />
                  <Button
                    size="lg"
                    variant="outline"
                    className="sm:justify-self-start sm:min-w-56"
                    disabled={m.tx.isBusy || wd === 0n || (pos.maxWithdrawable !== undefined && wd > pos.maxWithdrawable)}
                    onClick={async () => (await m.withdrawCollateral(wd)) && setWithdraw("")}
                  >
                    Withdraw OUSD
                  </Button>
                </div>
                <TxProgress tx={m.tx} successNote="Done. Your position is updated." />
              </div>
            )}
          </ConnectGate>
        </Panel>
      )}

      {section === "position" && (
        <Panel key="position" title="Your position" description="Tracked separately for each wallet.">
          <ConnectGate persona="lp" why="Connect a wallet to see its position.">
            {!loaded ? (
              <p className="text-muted-foreground py-4 text-sm">Position unavailable right now. Retrying…</p>
            ) : (
              <>
                <BigNumber value={pos.ratioBps === null ? "No debt" : fmtBps(pos.ratioBps)} className={h === "liquidatable" ? "text-destructive" : undefined} />
                <p className="text-muted-foreground mt-2 text-sm">{HEALTH_COPY[h]}</p>
                {pos.ratioBps !== null && pos.ratioBps !== undefined && <RatioMeter bps={pos.ratioBps} className="mt-6" />}
                <Rows className="mt-4">
                  <Row label="Collateral locked" value={`${fmtAmount(pos.collateral)} OUSD`} />
                  <Row label="Debt" value={`${fmtAmount(pos.debt)} xMXN`} />
                  <Row label="Can still mint" sub="Staying at 150%" value={pos.maxMintable === undefined ? "—" : `${fmtAmount(pos.maxMintable)} xMXN`} />
                  <Row label="Can withdraw" value={pos.maxWithdrawable === undefined ? "—" : `${fmtAmount(pos.maxWithdrawable)} OUSD`} />
                  <Row label="Liquidation" sub="Below 135%, anyone can repay part of the debt and take collateral plus a 10% penalty" value={pos.isLiquidatable ? <span className="text-destructive">Open to liquidation</span> : "Not liquidatable"} />
                </Rows>
              </>
            )}
          </ConnectGate>
        </Panel>
      )}

      {section === "fx" && (
        <Panel key="fx" title="Exchange rate" description="Used for minting limits and swap quotes." aside={<MockOracleBadge />}>
          <BigNumber value={fx.rate === undefined ? "—" : fmtNumber(fx.rate, 4)} unit="MXN per USD" className="mt-2" />
          <Rows className="mt-4">
            <Row label="Source" sub="An admin sets it on testnet. Not a market price." value="Mock admin oracle" />
            <Row label="Last updated" value={fx.updatedAt !== undefined && now !== undefined ? timeAgo(fx.updatedAt, now) : "—"} />
            <Row label="Max age" sub="Older than this and minting, withdrawals and swaps stop" value={fx.maxAge !== undefined ? `${Math.round(fx.maxAge / 60)} min` : "—"} />
            <Row
              label="Status"
              value={
                fx.valid === undefined ? "—" : fx.paused ? <span className="text-destructive">Paused</span> : fx.valid ? "Fresh" : <span className="text-destructive">Stale</span>
              }
            />
          </Rows>
        </Panel>
      )}

      {section === "stress" && (
        <Panel
          key="stress"
          title="What if the peso gets stronger?"
          description="Your collateral is in dollars and your debt is in pesos. When the peso strengthens, each dollar covers fewer pesos and your ratio falls."
          aside={<span className="bg-warning/15 text-warning-ink rounded-full px-3 py-1 text-sm">Mock scenario, preview only</span>}
        >
          <PesoStress collateral={drafting ? nextColl : coll} debt={drafting ? nextDebt : debt} mxnPerUsd={price} projected={drafting} />
        </Panel>
      )}
    </SettingsLayout>
  );
}
