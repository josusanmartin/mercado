"use client";
// Preview-only FX stress: what happens to THIS position if the peso strengthens. Pure client-side
// math on the viewer's actual (or projected) position; it never writes the shared oracle.
import { useEffect, useMemo, useState } from "react";
import { fmtBps, fmtNumber } from "@/lib/format";
import { health, healthCopy, mxnPerUnit, rateAtThreshold, ratioBps, V1_LINES, type Lines } from "@/lib/vault-math";
import { cn } from "@/lib/utils";
import { Slider } from "@/components/ui/slider";
import { RatioMeter } from "./ratio-meter";

const MIN_RATE = 8;
const MAX_RATE = 25;

export function PesoStress({
  collateral,
  debt,
  mxnPerUsd,
  projected,
  usdPx8,
  lines = V1_LINES,
}: {
  collateral: bigint;
  debt: bigint;
  mxnPerUsd: bigint | undefined;
  projected: boolean;
  /** Collateral USD price, 8dp (OUSD = $1). The slider stresses only the FX rate. */
  usdPx8?: bigint;
  lines?: Lines;
}) {
  const current = mxnPerUsd !== undefined ? Number(mxnPerUsd) / 1e8 : 20;
  const [rate, setRate] = useState(current);
  const [touched, setTouched] = useState(false);
  useEffect(() => {
    if (!touched) setRate(current);
  }, [current, touched]);

  const px = usdPx8 ?? 10n ** 8n;
  const bpsAt = useMemo(() => ratioBps(collateral, debt, mxnPerUnit(BigInt(Math.round(rate * 1e8)), px)), [collateral, debt, rate, px]);
  const bpsNow = mxnPerUsd !== undefined ? ratioBps(collateral, debt, mxnPerUnit(mxnPerUsd, px)) : undefined;
  // Rate (MXN per USD) at which this position crosses its liquidation line, given the collateral's USD price.
  const unitRed = rateAtThreshold(collateral, debt, lines.liqBps);
  const redLine = unitRed === undefined ? undefined : (unitRed * 1e8) / Number(px);
  const h = health(bpsAt, lines);
  const move = rate / current - 1; // + means the dollar buys more pesos
  const empty = debt === 0n;

  return (
    <div className="grid gap-5 pt-2">
        {empty ? (
          <p className="text-muted-foreground text-sm">Enter an amount to mint, or open a position, to see how it holds up.</p>
        ) : (
          <>
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="text-muted-foreground text-xs">{projected ? "Projected position" : "Your position"} at</p>
                <p className="text-4xl font-semibold tabular">
                  {fmtNumber(rate, 2)} <span className="text-muted-foreground text-base font-normal">MXN/USD</span>
                </p>
              </div>
              <div className="text-right">
                <p
                  className={cn(
                    "text-4xl font-semibold tabular",
                    h === "liquidatable" ? "text-destructive" : h === "tight" ? "text-warning-ink" : undefined,
                  )}
                >
                  {fmtBps(bpsAt)}
                </p>
                <p className="text-muted-foreground text-xs">{healthCopy(h, lines)}</p>
              </div>
            </div>
            <Slider
              min={MIN_RATE}
              max={MAX_RATE}
              step={0.05}
              value={[rate]}
              onValueChange={([v]) => {
                setTouched(true);
                setRate(v);
              }}
              aria-label="MXN per USD exchange rate (preview)"
              className={cn(h === "liquidatable" && "[&_[data-slot=slider-range]]:bg-destructive [&_[data-slot=slider-thumb]]:border-destructive")}
            />
            <div className="text-muted-foreground -mt-3 flex justify-between text-xs tabular">
              <span>{MIN_RATE} · stronger peso</span>
              <span>weaker peso · {MAX_RATE}</span>
            </div>
            <RatioMeter bps={bpsAt} compareBps={bpsNow} lines={lines} />
            <p className="text-sm text-pretty">
              {Math.abs(move) < 0.0005 ? (
                <>This is today&apos;s on-chain rate.</>
              ) : move < 0 ? (
                <>
                  Here the dollar has fallen <strong className="tabular">{fmtNumber(-move * 100, 1)}%</strong> against the peso.
                </>
              ) : (
                <>
                  Here the dollar has risen <strong className="tabular">{fmtNumber(move * 100, 1)}%</strong> against the peso.
                </>
              )}{" "}
              {redLine !== undefined && (
                <>
                  This position turns red, open to liquidation, below <strong className="tabular">{fmtNumber(redLine, 2)} MXN/USD</strong>
                  {redLine < current && <>, a {fmtNumber((1 - redLine / current) * 100, 0)}% fall in the dollar</>}.
                </>
              )}
            </p>
            {touched && (
              <button
                type="button"
                className="justify-self-start rounded-full text-sm underline-offset-4 hover:underline"
                onClick={() => {
                  setTouched(false);
                  setRate(current);
                }}
              >
                Back to today&apos;s rate
              </button>
            )}
          </>
        )}
    </div>
  );
}
