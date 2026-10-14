"use client";
import { AlertTriangle } from "lucide-react";
import { useOracle } from "@/lib/contracts";
import { fmtNumber, timeAgo } from "@/lib/format";
import { useNow } from "@/lib/use-now";
import { MockOracleBadge } from "@/components/shell/labels";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardAction } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export function FxCard() {
  const fx = useOracle();
  const now = useNow(5_000);
  const stale = fx.valid === false;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Exchange rate</CardTitle>
        <CardDescription>Used for minting limits and swap quotes</CardDescription>
        <CardAction>
          <MockOracleBadge />
        </CardAction>
      </CardHeader>
      <CardContent className="grid gap-3">
        {fx.rate === undefined ? (
          <Skeleton className="h-9 w-40" />
        ) : (
          <p className="font-display text-3xl font-semibold tabular">
            {fmtNumber(fx.rate, 4)} <span className="text-muted-foreground text-base font-normal">MXN per USD</span>
          </p>
        )}
        {fx.updatedAt !== undefined && now !== undefined && (
          <p className="text-muted-foreground text-xs">
            Updated {timeAgo(fx.updatedAt, now)} by the testnet admin feed. Not a market price.
          </p>
        )}
        {(stale || fx.paused) && (
          <p className="flex items-start gap-2 rounded-md bg-destructive/5 p-2 text-sm text-destructive">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            {fx.paused
              ? "The rate feed is paused. Minting, withdrawing and swaps are blocked until it resumes."
              : "The rate is stale (older than an hour). Minting, withdrawing and swaps are blocked until it updates."}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
