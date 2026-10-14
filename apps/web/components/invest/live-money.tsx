"use client";
// A balance that ticks every ~50ms (real-time interest). Writes straight to the DOM through refs, so React
// doesn't re-render 20×/s. "hero": the display face, "US$160" big + ".00012345" small; "row": one tabular
// line where the digits past the cents are muted. Respects prefers-reduced-motion (updates once a second).
// `glow` (v6): the earning digits get a soft glow pulse each second (editorial.css .m-ed-glow; off under reduced motion).
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { Display } from "@/components/mobile";
import type { LiveValue } from "./use-live-yield";

const intFmt = new Intl.NumberFormat("es-MX", { maximumFractionDigits: 0 });

function split(v: number, decimals: number) {
  const fixed = v.toFixed(decimals); // "160.00012345"
  const [i, d = ""] = fixed.split(".");
  return { int: intFmt.format(Number(i)), cents: d.slice(0, 2), tail: d.slice(2) };
}

export function LiveMoney({
  live,
  currency,
  variant = "row",
  size = 50,
  decimals = 8,
  glow,
  className,
}: {
  live: LiveValue;
  currency: "USD" | "MXN";
  variant?: "hero" | "row";
  size?: number;
  decimals?: number;
  glow?: boolean;
  className?: string;
}) {
  const prefix = currency === "USD" ? "US$" : "MX$";
  const intRef = useRef<HTMLSpanElement>(null);
  const decRef = useRef<HTMLSpanElement>(null);
  const tailRef = useRef<HTMLSpanElement>(null);
  const [first, setFirst] = useState<ReturnType<typeof split>>();

  useEffect(() => {
    const paint = () => {
      const v = live.at(Date.now() / 1000);
      if (v === undefined) return;
      const s = split(v, decimals);
      if (!intRef.current) return setFirst(s); // first paint goes through React
      intRef.current.textContent = s.int;
      if (decRef.current) decRef.current.textContent = `.${s.cents}`;
      if (tailRef.current) tailRef.current.textContent = s.tail;
    };
    paint();
    const slow = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const t = setInterval(paint, slow ? 1000 : 50);
    return () => clearInterval(t);
  }, [live, decimals]);

  if (!first)
    return variant === "hero" ? (
      <Display size={size} className={className}>
        <span className="text-[var(--m-surface-3)]">—</span>
      </Display>
    ) : (
      <span className={cn("m-num text-[var(--m-on-surface-variant)]", className)}>—</span>
    );

  if (variant === "hero")
    return (
      <Display fit size={size} className={cn("flex items-baseline", className)}>
        <span>
          {prefix}
          <span ref={intRef}>{first.int}</span>
        </span>
        <span className="text-[0.42em]">
          <span ref={decRef}>.{first.cents}</span>
          <span ref={tailRef} className={cn("text-[var(--m-on-surface-variant)]", glow && "m-ed-glow")}>
            {first.tail}
          </span>
        </span>
      </Display>
    );
  return (
    <span className={cn("m-num whitespace-nowrap", className)} aria-label={`${prefix}${first.int}.${first.cents}`}>
      {prefix}
      <span ref={intRef}>{first.int}</span>
      <span ref={decRef}>.{first.cents}</span>
      <span ref={tailRef} className={cn("text-[0.85em] text-[var(--m-on-surface-variant)]", glow && "m-ed-glow")}>
        {first.tail}
      </span>
    </span>
  );
}
