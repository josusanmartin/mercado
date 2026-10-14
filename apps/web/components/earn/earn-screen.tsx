"use client";
// Earn (console Settings layout): lenders supply xMXN to the pool that funds driver advances. Lenders earn
// only the flat fee drivers pay when they repay. No promised APY, no default cover, and lent xMXN stays
// locked until it's repaid.
import { useState } from "react";
import { useConnection } from "wagmi";
import { ArrowDownToLine, ArrowUpFromLine, Landmark, PieChart, ShieldAlert, Wallet } from "lucide-react";
import { BigNumber, ListPane, Panel, PanelActions, Row, Rows, SettingsLayout } from "@/components/console";
import { ConnectGate } from "@/components/shell/connect-gate";
import { TokenInput } from "@/components/shell/token-input";
import { TxProgress } from "@/components/shell/tx-progress";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useBalances, useMercado, usePool } from "@/lib/contracts";
import { fmtAmount, toUnits } from "@/lib/format";
import { ThreeBuckets } from "./three-buckets";

type Section = "supply" | "withdraw" | "lending" | "pool" | "money" | "risks";
const FEE_PCT = 2; // CreditPool feeBps = 200, flat per advance
const MAX_UTILIZATION = 80;
const min = (a?: bigint, b?: bigint) => (a === undefined || b === undefined ? undefined : a < b ? a : b);
const xmxn = (v: bigint | undefined) => (v === undefined ? "…" : `${fmtAmount(v)} xMXN`);

const NO_YIELD = <Badge variant="mock">No guaranteed return</Badge>;

function pct(part: bigint | undefined, whole: bigint | undefined) {
  return part !== undefined && whole ? Number((part * 10_000n) / whole) / 100 : undefined;
}

export function EarnScreen() {
  const { address } = useConnection();
  const pool = usePool();
  const bal = useBalances();
  const supplyM = useMercado();
  const withdrawM = useMercado();
  const [section, setSection] = useState<Section>("supply");
  const [supplyIn, setSupplyIn] = useState("");
  const [withdrawIn, setWithdrawIn] = useState("");
  // clear drafts when the wallet changes (state adjusted during render, no effect)
  const [draftFor, setDraftFor] = useState(address);
  if (draftFor !== address) {
    setDraftFor(address);
    setSupplyIn("");
    setWithdrawIn("");
  }

  const supplyAmt = toUnits(supplyIn);
  const withdrawAmt = toUnits(withdrawIn);
  const maxWithdraw = min(pool.lenderBalance, pool.available);
  const share = pct(pool.lenderBalance, pool.totalAssets);
  const utilization = pct(pool.outstanding, pool.totalAssets);
  const lockedInLoans =
    pool.lenderBalance !== undefined && maxWithdraw !== undefined && pool.lenderBalance > maxWithdraw ? pool.lenderBalance - maxWithdraw : 0n;

  const items = [
    { id: "supply", label: "Supply", icon: ArrowDownToLine },
    { id: "withdraw", label: "Withdraw", icon: ArrowUpFromLine },
    { id: "lending", label: "Your lending", icon: Wallet, hint: pool.lenderBalance !== undefined && address ? fmtAmount(pool.lenderBalance, 0) : undefined },
    { id: "pool", label: "Advance pool", icon: PieChart, hint: utilization !== undefined ? `${utilization.toFixed(0)}% lent` : undefined },
    { id: "money", label: "Where the money sits", icon: Landmark },
    { id: "risks", label: "Risks", icon: ShieldAlert },
  ];

  return (
    <SettingsLayout title="Earn" list={<ListPane label="Earn sections" items={items} value={section} onChange={(id) => setSection(id as Section)} />}>
      {section === "supply" && (
        <Panel
          key="supply"
          title="Supply xMXN"
          description={`Your xMXN funds driver advances. Lenders share the flat ${FEE_PCT}% fee drivers pay, and only once they repay. Advances are unsecured and repaid manually.`}
          aside={NO_YIELD}
        >
          <ConnectGate persona="lender" why="Connect a wallet holding xMXN to supply the advance pool.">
            <div className="grid gap-5 pt-2">
              <TokenInput
                label="Amount to supply"
                symbol="xMXN"
                value={supplyIn}
                onChange={setSupplyIn}
                max={bal.xmxn}
                maxLabel="Wallet"
                disabled={supplyM.tx.isBusy}
              />
              <Rows>
                <Row label="Your claim after" value={xmxn(pool.lenderBalance !== undefined ? pool.lenderBalance + supplyAmt : undefined)} />
                <Row label="Pool cash available" sub="What lenders can withdraw right now" value={xmxn(pool.available)} />
              </Rows>
              <PanelActions>
                <Button
                  size="lg"
                  disabled={supplyAmt === 0n || (bal.xmxn !== undefined && supplyAmt > bal.xmxn) || supplyM.tx.isBusy}
                  onClick={async () => (await supplyM.supply(supplyAmt)) && setSupplyIn("")}
                >
                  Supply {supplyAmt > 0n ? `${fmtAmount(supplyAmt)} xMXN` : "xMXN"}
                </Button>
              </PanelActions>
              <TxProgress tx={supplyM.tx} successNote="Supplied. It's now available for driver advances." />
            </div>
          </ConnectGate>
        </Panel>
      )}

      {section === "withdraw" && (
        <Panel
          key="withdraw"
          title="Withdraw"
          description="Only idle cash can come out. xMXN lent to drivers stays in loans until it's repaid."
          aside={NO_YIELD}
        >
          <ConnectGate persona="lender" why="Connect the wallet that supplied the pool.">
            <div className="grid gap-5 pt-2">
              <TokenInput
                label="Amount to withdraw"
                symbol="xMXN"
                value={withdrawIn}
                onChange={setWithdrawIn}
                max={maxWithdraw}
                maxLabel="Withdrawable"
                disabled={withdrawM.tx.isBusy}
              />
              <Rows>
                <Row label="Your claim" value={xmxn(pool.lenderBalance)} />
                <Row
                  label="Locked in loans"
                  sub={lockedInLoans > 0n ? "Unlocks as drivers repay" : "Nothing of yours is locked right now"}
                  value={xmxn(lockedInLoans)}
                />
              </Rows>
              <PanelActions>
                <Button
                  size="lg"
                  variant="outline"
                  disabled={withdrawAmt === 0n || (maxWithdraw !== undefined && withdrawAmt > maxWithdraw) || withdrawM.tx.isBusy}
                  onClick={async () => (await withdrawM.withdrawSupply(withdrawAmt)) && setWithdrawIn("")}
                >
                  Withdraw {withdrawAmt > 0n ? `${fmtAmount(withdrawAmt)} xMXN` : "xMXN"}
                </Button>
              </PanelActions>
              <TxProgress tx={withdrawM.tx} successNote="Withdrawn to your wallet." />
            </div>
          </ConnectGate>
        </Panel>
      )}

      {section === "lending" && (
        <Panel key="lending" title="Your lending" description="Your claim is your principal plus your share of fees from repaid advances." aside={NO_YIELD}>
          <ConnectGate persona="lender" why="Connect a lender wallet to see its claim.">
            <div className="grid gap-5 pt-2">
              <BigNumber value={pool.lenderBalance === undefined ? "…" : fmtAmount(pool.lenderBalance)} unit="xMXN" />
              <Rows>
                <Row label="Share of the pool" value={share === undefined ? "…" : `${share.toFixed(2)}%`} />
                <Row label="Withdrawable now" value={xmxn(maxWithdraw)} />
                <Row label="Locked in loans" value={xmxn(lockedInLoans)} />
                <Row label="Wallet" sub="Available to supply" value={xmxn(bal.xmxn)} />
              </Rows>
            </div>
          </ConnectGate>
        </Panel>
      )}

      {section === "pool" && (
        <Panel key="pool" title="Advance pool" description="Live from the CreditPool contract on Tempo Moderato.">
          <div className="grid gap-5 pt-2">
            <BigNumber value={pool.available === undefined ? "…" : fmtAmount(pool.available)} unit="xMXN available" />
            <Rows>
              <Row label="Lender claims" sub="Idle cash plus principal lent out" value={xmxn(pool.totalAssets)} />
              <Row label="Lent to drivers" sub="Open, unsecured exposure" value={xmxn(pool.outstanding)} />
              <Row
                label="Utilization"
                sub={`At most ${MAX_UTILIZATION}% of the pool can be lent at once`}
                value={utilization === undefined ? "…" : `${utilization.toFixed(1)}%`}
              />
              <Row label="Realized fees" sub={`${FEE_PCT}% flat, counted only when repaid`} value={xmxn(pool.realizedFees)} />
              <Row label="Total ever lent" value={xmxn(pool.totalBorrowed)} />
              <Row label="Per-driver cap" value="1,500.00 xMXN" />
            </Rows>
          </div>
        </Panel>
      )}

      {section === "money" && <ThreeBuckets key="money" />}

      {section === "risks" && (
        <Panel key="risks" title="Risks" description="Testnet prototype: this is not a yield product." aside={NO_YIELD}>
          <Rows>
            <Row label="Unsecured advances" sub="Drivers post no collateral. Unpaid advances are not covered, and there's no write-off or backstop." value="" />
            <Row label="Illustrative underwriting" sub="Eligibility comes from a demo score on Demo Uber Data, not a validated credit model." value={<Badge variant="mock">Demo data</Badge>} />
            <Row label="Manual repayment" sub="No automatic deduction from driver payouts." value="" />
            <Row label="No promised APY" sub="Returns are only the fees drivers actually repay." value="" />
            <Row label="Synthetic peso" sub="xMXN is a testnet token with no market peg and no peso redemption." value={<Badge variant="mock">Testnet</Badge>} />
          </Rows>
        </Panel>
      )}
    </SettingsLayout>
  );
}
