"use client";
// Weekly earnings bars (plain SVG, no chart library): net per week, gross as a ghost bar, median line.
import type { WeeklyEarnings } from "@mercado/shared";

export function EarningsChart({ weeks, median }: { weeks: WeeklyEarnings[]; median?: number }) {
  const W = 560;
  const H = 180;
  const pad = { l: 44, r: 8, t: 10, b: 26 };
  const max = Math.max(1, ...weeks.map((w) => w.grossMxn)) * 1.08;
  const bw = (W - pad.l - pad.r) / Math.max(1, weeks.length);
  const y = (v: number) => pad.t + (H - pad.t - pad.b) * (1 - v / max);
  const ticks = [0, 0.5, 1].map((f) => Math.round((max * f) / 1000) * 1000);
  return (
    <figure className="w-full">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label="Weekly earnings, Demo Uber Data">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} className="stroke-border" strokeDasharray="2 3" />
            <text x={pad.l - 6} y={y(t) + 3} textAnchor="end" className="fill-muted-foreground text-[10px]">
              {t >= 1000 ? `${t / 1000}k` : t}
            </text>
          </g>
        ))}
        {weeks.map((w, i) => {
          const x = pad.l + i * bw + bw * 0.15;
          const width = bw * 0.7;
          return (
            <g key={w.weekStart}>
              <title>{`${w.weekStart}: net ${w.netMxn.toLocaleString("en-US")} MXN, ${w.trips} trips, ${w.activeHours} h`}</title>
              <rect x={x} y={y(w.grossMxn)} width={width} height={Math.max(0, y(0) - y(w.grossMxn))} rx={2} className="fill-muted" />
              <rect x={x} y={y(w.netMxn)} width={width} height={Math.max(0, y(0) - y(w.netMxn))} rx={2} className="fill-primary" />
              {i % 2 === 0 && (
                <text x={x + width / 2} y={H - 8} textAnchor="middle" className="fill-muted-foreground text-[9px]">
                  {w.weekStart.slice(5)}
                </text>
              )}
            </g>
          );
        })}
        {median !== undefined && (
          <g>
            <line x1={pad.l} x2={W - pad.r} y1={y(median)} y2={y(median)} className="stroke-foreground" strokeWidth={1} strokeDasharray="5 3" />
            <text x={W - pad.r} y={y(median) - 4} textAnchor="end" className="fill-foreground text-[10px]">
              median net {Math.round(median).toLocaleString("en-US")}
            </text>
          </g>
        )}
      </svg>
      <figcaption className="mt-1 flex gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1"><span className="inline-block size-2.5 rounded-sm bg-primary" /> net (after Uber fee)</span>
        <span className="flex items-center gap-1"><span className="inline-block size-2.5 rounded-sm bg-muted" /> gross</span>
        <span>MXN per week · Demo Uber Data</span>
      </figcaption>
    </figure>
  );
}
