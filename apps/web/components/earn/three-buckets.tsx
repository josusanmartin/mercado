"use client";
// "Three buckets of money": vault collateral, swap-desk inventory and the advance pool are separately
// funded on-chain. Showing them side by side proves the vault isn't funding the desk or the drivers.
import { ExternalLink, Landmark, Repeat, HandCoins } from "lucide-react";
import { explorerAddress } from "@mercado/shared";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { ADDR, useThreeBuckets } from "@/lib/contracts";
import { fmtAmount } from "@/lib/format";
import { cn } from "@/lib/utils";

const MAX_UTILIZATION = 80; // CreditPool maxUtilizationBps / 100

function Amount({ value, symbol }: { value: bigint | undefined; symbol: string }) {
  if (value === undefined) return <Skeleton className="h-6 w-28" />;
  return (
    <span className="font-display text-xl font-semibold tabular">
      {fmtAmount(value)} <span className="text-muted-foreground text-sm font-medium">{symbol}</span>
    </span>
  );
}

function Bucket({
  icon: Icon,
  title,
  address,
  source,
  children,
}: {
  icon: typeof Landmark;
  title: string;
  address: string;
  source: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="gap-3">
      <CardHeader className="gap-1">
        <CardTitle className="flex items-center gap-2 text-base">
          <Icon className="text-primary size-4" />
          {title}
        </CardTitle>
        <CardDescription className="text-xs">{source}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-2">
        {children}
        <a
          href={explorerAddress(address)}
          target="_blank"
          rel="noreferrer"
          className="text-primary inline-flex items-center gap-1 text-xs hover:underline"
        >
          Contract on explorer <ExternalLink className="size-3" />
        </a>
      </CardContent>
    </Card>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-muted-foreground text-sm">{label}</span>
      {children}
    </div>
  );
}

export function ThreeBuckets({ className }: { className?: string }) {
  const b = useThreeBuckets();
  const lent = b.pool.loansOut;
  const claims = b.pool.lenderClaims;
  const utilization = lent !== undefined && claims ? Number((lent * 10_000n) / claims) / 100 : undefined;

  return (
    <section className={cn("grid gap-3", className)} aria-labelledby="three-buckets">
      <div>
        <h2 id="three-buckets" className="font-display text-lg font-semibold">
          Where the money sits
        </h2>
        <p className="text-muted-foreground text-sm">
          Three separately funded pools. None of them can spend another&apos;s balance.
        </p>
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        <Bucket
          icon={Landmark}
          title="Vault collateral"
          address={ADDR.vault}
          source="Testnet OUSD locked by people minting xMXN. It backs only their own debt and is never lent or swapped."
        >
          <Row label="OUSD locked">
            <Amount value={b.vault.collateralOusd} symbol="OUSD" />
          </Row>
          <Row label="xMXN debt">
            <Amount value={b.vault.debtXmxn} symbol="xMXN" />
          </Row>
        </Bucket>

        <Bucket
          icon={Repeat}
          title="Swap desk inventory"
          address={ADDR.swapDesk}
          source="Seeded separately by a liquidity provider from its own vault position. A capped demo desk, not a market."
        >
          <Row label="OUSD">
            <Amount value={b.desk.ousd} symbol="OUSD" />
          </Row>
          <Row label="xMXN">
            <Amount value={b.desk.xmxn} symbol="xMXN" />
          </Row>
        </Bucket>

        <Bucket
          icon={HandCoins}
          title="Advance pool"
          address={ADDR.creditPool}
          source="xMXN supplied by lenders. It funds driver advances only and is repaid manually by drivers."
        >
          <Row label="Cash available">
            <Amount value={b.pool.cash} symbol="xMXN" />
          </Row>
          <Row label="Lent to drivers">
            <Amount value={lent} symbol="xMXN" />
          </Row>
          {utilization !== undefined && (
            <div className="grid gap-1">
              <Progress value={(utilization / MAX_UTILIZATION) * 100} aria-label="Pool utilization" />
              <p className="text-muted-foreground text-xs tabular">
                {utilization.toFixed(1)}% lent out · cap {MAX_UTILIZATION}%
              </p>
            </div>
          )}
        </Bucket>
      </div>
    </section>
  );
}
