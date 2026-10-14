// Horizontal collateral-ratio scale with the three protocol lines: 135% liquidation, 150% minimum
// to mint, 200% recommended. Zones are colored so the stress slider can push the marker into red.
import { cn } from "@/lib/utils";
import { fmtBps } from "@/lib/format";
import { health } from "@/lib/vault-math";

const MIN = 100;
const MAX = 350;
const pct = (v: number) => `${((Math.min(Math.max(v, MIN), MAX) - MIN) / (MAX - MIN)) * 100}%`;

const LINES = [
  { at: 135, label: "135% liquidation" },
  { at: 150, label: "150% min" },
  { at: 200, label: "200% recommended" },
];

export function RatioMeter({ bps, compareBps, className }: { bps: bigint | null | undefined; compareBps?: bigint | null; className?: string }) {
  const value = bps === null || bps === undefined ? undefined : Number(bps) / 100;
  const compare = compareBps === null || compareBps === undefined ? undefined : Number(compareBps) / 100;
  const h = health(bps);
  return (
    <div className={cn("grid gap-1.5", className)}>
      <div className="relative h-3 overflow-hidden rounded-full">
        <div className="absolute inset-y-0 left-0 bg-destructive/70" style={{ width: pct(135) }} />
        <div className="absolute inset-y-0 bg-warning/60" style={{ left: pct(135), width: `calc(${pct(150)} - ${pct(135)})` }} />
        <div className="absolute inset-y-0 bg-warning/25" style={{ left: pct(150), width: `calc(${pct(200)} - ${pct(150)})` }} />
        <div className="absolute inset-y-0 right-0 bg-primary/25" style={{ left: pct(200) }} />
      </div>
      <div className="relative h-5">
        {LINES.map((l) => (
          <span key={l.at} className="bg-foreground/30 absolute -top-[1.1rem] h-4 w-px" style={{ left: pct(l.at) }} aria-hidden />
        ))}
        {compare !== undefined && (
          <span
            className="border-muted-foreground absolute -top-[1.35rem] size-3 -translate-x-1/2 rounded-full border-2 bg-card"
            style={{ left: pct(compare) }}
            title={`Now: ${fmtBps(compareBps!)}`}
            aria-hidden
          />
        )}
        {value !== undefined && (
          <span
            className={cn(
              "absolute -top-[1.45rem] size-4 -translate-x-1/2 rounded-full border-2 border-card shadow transition-[left] duration-200",
              h === "liquidatable" ? "bg-destructive" : h === "tight" ? "bg-warning" : h === "ok" ? "bg-warning" : "bg-primary",
            )}
            style={{ left: pct(value) }}
            aria-hidden
          />
        )}
        <div className="text-muted-foreground flex justify-between text-[11px] tabular">
          <span>100%</span>
          <span style={{ position: "absolute", left: pct(135), transform: "translateX(-50%)" }}>135</span>
          <span style={{ position: "absolute", left: pct(150), transform: "translateX(-10%)" }}>150</span>
          <span style={{ position: "absolute", left: pct(200), transform: "translateX(-50%)" }}>200</span>
          <span>350%+</span>
        </div>
      </div>
    </div>
  );
}
