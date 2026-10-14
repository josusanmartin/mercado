"use client";
// Pick what to lock in Create. Each option shows its mint limit (as LTV), liquidation line and where
// its yield comes from; demo tokens are labeled; v2 options stay disabled until they're deployed.
import type { Collateral } from "@/lib/v2/collaterals";
import { fmtBps } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

const ltv = (minRatioBps?: bigint) => (minRatioBps ? fmtBps(Number((10_000n * 10_000n) / minRatioBps), 0) : "—");

export function CollateralPicker({ items, value, onChange, disabled }: { items: Collateral[]; value: string; onChange: (id: string) => void; disabled?: boolean }) {
  return (
    <fieldset className="grid gap-2">
      <legend className="mb-2 text-sm font-medium">Collateral</legend>
      <div data-nav="row" role="radiogroup" className="grid gap-3 sm:grid-cols-3">
        {items.map((c) => {
          const on = c.id === value;
          return (
            <button
              key={c.id}
              type="button"
              role="radio"
              aria-checked={on}
              data-nav-item=""
              disabled={disabled || !c.available}
              onClick={() => onChange(c.id)}
              className={cn(
                "grid content-start gap-2 rounded-[14px] p-4 text-left transition-transform duration-150 ease-out disabled:cursor-not-allowed",
                on ? "bg-card shadow-tile ring-foreground ring-2" : "bg-muted",
                !c.available && "opacity-70",
              )}
            >
              <span className="flex items-center justify-between gap-2">
                <span className="text-lg font-semibold">{c.symbol}</span>
                {!c.available ? (
                  <Badge variant="secondary">v2, coming</Badge>
                ) : c.mintPaused ? (
                  <Badge variant="secondary">Minting paused</Badge>
                ) : c.demo ? (
                  <Badge variant="mock">Demo token</Badge>
                ) : (
                  <Badge variant="success">Live</Badge>
                )}
              </span>
              <span className="text-muted-foreground text-sm">{c.name}</span>
              {c.usdPx8 !== undefined && c.symbol !== "OUSD" && (
                <span className="text-sm tabular">
                  ${(Number(c.usdPx8) / 1e8).toFixed(2)} <span className="text-muted-foreground">per unit, admin feed</span>
                </span>
              )}
              <span className="grid gap-0.5 text-sm">
                <span>
                  Max LTV <span className="tabular font-medium">{ltv(c.lines?.minBps)}</span>
                  {c.lines && <span className="text-muted-foreground"> · liquidation below {fmtBps(c.lines.liqBps, 0)}</span>}
                </span>
                <span className="text-muted-foreground text-xs">Yield: {c.yieldSource}</span>
              </span>
            </button>
          );
        })}
      </div>
      <p className="text-muted-foreground text-xs">
        Collateral keeps any yield it earns inside the token; the vault runs no strategies. Demo tokens have admin-set yield and prices, with no real backing.
      </p>
    </fieldset>
  );
}
