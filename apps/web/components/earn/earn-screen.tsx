"use client";
// Earn: lenders supply xMXN to the driver-advance pool. Lenders earn only the flat fee drivers pay when they
// repay. There's no promised APY, no default cover, and lent xMXN can't be withdrawn until it's repaid.
import { useState } from "react";
import { ShieldAlert } from "lucide-react";
import { useConnection } from "wagmi";
import { ConnectGate } from "@/components/shell/connect-gate";
import { Stat } from "@/components/shell/labels";
import { PageHeader } from "@/components/shell/page-header";
import { TokenInput } from "@/components/shell/token-input";
import { TxProgress } from "@/components/shell/tx-progress";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useBalances, useMercado, usePool } from "@/lib/contracts";
import { fmtAmount, toUnits } from "@/lib/format";
import { ThreeBuckets } from "./three-buckets";

const FEE_PCT = 2; // CreditPool feeBps = 200, flat per advance
const MAX_UTILIZATION = 80;
const min = (a?: bigint, b?: bigint) => (a === undefined || b === undefined ? undefined : a < b ? a : b);

function PoolStats() {
  const pool = usePool();
  const utilization =
    pool.outstanding !== undefined && pool.totalAssets ? Number((pool.outstanding * 10_000n) / pool.totalAssets) / 100 : undefined;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Advance pool</CardTitle>
        <CardDescription>Live from the CreditPool contract on Tempo Moderato.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-5">
        <dl className="grid grid-cols-2 gap-x-6 gap-y-4">
          <Stat label="Lender claims" value={`${fmtAmount(pool.totalAssets)} xMXN`} sub="idle cash + principal lent out" />
          <Stat label="Cash available" value={`${fmtAmount(pool.available)} xMXN`} sub="what lenders can withdraw now" />
          <Stat label="Lent to drivers" value={`${fmtAmount(pool.outstanding)} xMXN`} sub="open exposure, unsecured" />
          <Stat
            label="Realized fees"
            value={`${fmtAmount(pool.realizedFees)} xMXN`}
            sub={`${FEE_PCT}% flat, counted only when repaid`}
          />
        </dl>
        {utilization !== undefined && (
          <div className="grid gap-1.5">
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Utilization</span>
              <span className="tabular">
                {utilization.toFixed(1)}% <span className="text-muted-foreground">of {MAX_UTILIZATION}% cap</span>
              </span>
            </div>
            <Progress value={(utilization / MAX_UTILIZATION) * 100} aria-label="Pool utilization vs cap" />
          </div>
        )}
        <p className="text-muted-foreground text-xs">
          Total ever lent: {fmtAmount(pool.totalBorrowed)} xMXN. Advances are capped at 1,500 xMXN per driver, and at most{" "}
          {MAX_UTILIZATION}% of the pool can be lent out at once.
        </p>
      </CardContent>
    </Card>
  );
}

function LenderPanel() {
  const { address } = useConnection();
  const pool = usePool();
  const balances = useBalances();
  const supplyM = useMercado();
  const withdrawM = useMercado();
  const [supplyIn, setSupplyIn] = useState("");
  const [withdrawIn, setWithdrawIn] = useState("");
  const supplyAmt = toUnits(supplyIn);
  const withdrawAmt = toUnits(withdrawIn);
  const maxWithdraw = min(pool.lenderBalance, pool.available);
  const share =
    pool.lenderBalance !== undefined && pool.totalAssets ? Number((pool.lenderBalance * 10_000n) / pool.totalAssets) / 100 : undefined;
  const lockedInLoans =
    pool.lenderBalance !== undefined && maxWithdraw !== undefined && pool.lenderBalance > maxWithdraw
      ? pool.lenderBalance - maxWithdraw
      : 0n;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Your lending</CardTitle>
        <CardDescription>
          {address ? "Supply xMXN, or withdraw what isn't currently lent out." : "Connect to supply."}
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-5">
        <dl className="grid grid-cols-2 gap-x-6 gap-y-4">
          <Stat
            label="Your claim"
            value={`${fmtAmount(pool.lenderBalance)} xMXN`}
            sub={share !== undefined ? `${share.toFixed(2)}% of the pool` : undefined}
          />
          <Stat label="Wallet" value={`${fmtAmount(balances.xmxn)} xMXN`} sub="available to supply" />
        </dl>

        <Tabs defaultValue="supply">
          <TabsList className="w-full">
            <TabsTrigger value="supply">Supply</TabsTrigger>
            <TabsTrigger value="withdraw">Withdraw</TabsTrigger>
          </TabsList>

          <TabsContent value="supply" className="grid gap-3 pt-3">
            <TokenInput
              label="Amount to supply"
              symbol="xMXN"
              value={supplyIn}
              onChange={setSupplyIn}
              max={balances.xmxn}
              maxLabel="Wallet"
              disabled={supplyM.tx.isBusy}
              hint="Funds driver advances. You earn your share of fees only as drivers repay."
            />
            <Button
              disabled={supplyAmt === 0n || (balances.xmxn !== undefined && supplyAmt > balances.xmxn) || supplyM.tx.isBusy}
              onClick={async () => {
                if (await supplyM.supply(supplyAmt)) setSupplyIn("");
              }}
            >
              Supply {supplyAmt > 0n ? `${fmtAmount(supplyAmt)} xMXN` : "xMXN"}
            </Button>
            <TxProgress tx={supplyM.tx} successNote="Supplied. It's now available for driver advances." />
          </TabsContent>

          <TabsContent value="withdraw" className="grid gap-3 pt-3">
            <TokenInput
              label="Amount to withdraw"
              symbol="xMXN"
              value={withdrawIn}
              onChange={setWithdrawIn}
              max={maxWithdraw}
              maxLabel="Withdrawable"
              disabled={withdrawM.tx.isBusy}
              hint={
                lockedInLoans > 0n
                  ? `${fmtAmount(lockedInLoans)} xMXN of your claim is lent to drivers and unlocks as they repay.`
                  : "Only idle cash can be withdrawn; xMXN lent to drivers stays in loans until repaid."
              }
            />
            <Button
              variant="outline"
              disabled={withdrawAmt === 0n || (maxWithdraw !== undefined && withdrawAmt > maxWithdraw) || withdrawM.tx.isBusy}
              onClick={async () => {
                if (await withdrawM.withdrawSupply(withdrawAmt)) setWithdrawIn("");
              }}
            >
              Withdraw {withdrawAmt > 0n ? `${fmtAmount(withdrawAmt)} xMXN` : "xMXN"}
            </Button>
            <TxProgress tx={withdrawM.tx} successNote="Withdrawn to your wallet." />
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

export function EarnScreen() {
  return (
    <>
      <PageHeader
        title="Earn"
        lede="Supply xMXN to the pool that funds driver advances. Lenders share the flat 2% fee drivers pay when they repay."
        aside={<Badge variant="mock">No guaranteed return</Badge>}
      />
      <div className="grid gap-6">
        <div className="grid gap-4 lg:grid-cols-2">
          <ConnectGate persona="lender" why="Connect a wallet to supply xMXN to the advance pool.">
            <LenderPanel />
          </ConnectGate>
          <PoolStats />
        </div>

        <Alert variant="warning">
          <ShieldAlert />
          <AlertTitle>Testnet prototype: this is not a yield product</AlertTitle>
          <AlertDescription>
            Advances are unsecured and repaid manually by drivers. Eligibility comes from an illustrative score on Demo Uber
            Data, not a validated credit model. There&apos;s no promised APY, and losses from unpaid advances aren&apos;t covered.
            xMXN is a synthetic testnet token with no market peg.
          </AlertDescription>
        </Alert>

        <ThreeBuckets />
      </div>
    </>
  );
}
