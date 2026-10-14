"use client";
// v5 motion kit (crew/PRINCIPLES.md §v5): transform/opacity only, ease-out cubic-bezier(.2,.8,.2,1), 180–420ms,
// never bouncy. Pure CSS keyframes (globals.css "v5 motion") driven by a few tiny components; no dependency.
// prefers-reduced-motion collapses everything to the final state (the CSS does it; Ticker jumps).
// Nothing here delays a primary action: elements are clickable while they animate, and nothing shifts layout.
import { Children, isValidElement, useEffect, useRef, useState, useSyncExternalStore, type CSSProperties, type ElementType, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export const EASE = "cubic-bezier(.2,.8,.2,1)";
export const DUR = { fast: 180, base: 280, slow: 420 } as const;

const RM = "(prefers-reduced-motion: reduce)";
export function useReducedMotion(): boolean {
  return useSyncExternalStore(
    (cb) => {
      const m = window.matchMedia(RM);
      m.addEventListener("change", cb);
      return () => m.removeEventListener("change", cb);
    },
    () => window.matchMedia(RM).matches,
    () => false,
  );
}

/** Sets data-shown the first time the element scrolls into view (or at once if IO is unavailable). */
function useShown<T extends Element>() {
  const ref = useRef<T>(null);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || shown) return;
    if (typeof IntersectionObserver === "undefined") return setShown(true);
    const io = new IntersectionObserver((es) => es.some((e) => e.isIntersecting) && (setShown(true), io.disconnect()), { rootMargin: "0px 0px -8% 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, [shown]);
  return [ref, shown] as const;
}

/** Fade-up on first view. */
export function Reveal({ children, delay = 0, as: Tag = "div", className }: { children: ReactNode; delay?: number; as?: ElementType; className?: string }) {
  const [ref, shown] = useShown<HTMLElement>();
  return (
    <Tag ref={ref} data-shown={shown || undefined} className={cn("mx-reveal", className)} style={{ "--mx-delay": `${delay}ms` } as CSSProperties}>
      {children}
    </Tag>
  );
}

/** Children fade up one after another (40ms apart, capped) on first view. Works on lists: as="ul"/"ol". */
export function Stagger({ children, as: Tag = "div", className, step = 40 }: { children: ReactNode; as?: ElementType; className?: string; step?: number }) {
  const [ref, shown] = useShown<HTMLElement>();
  let i = 0;
  const kids = Children.map(children, (c) =>
    isValidElement<{ style?: CSSProperties }>(c) ? { ...c, props: { ...c.props, style: { ...c.props.style, "--i": Math.min(i++, 12), "--mx-step": `${step}ms` } as CSSProperties } } : c,
  );
  return (
    <Tag ref={ref} data-shown={shown || undefined} className={cn("mx-stagger", className)}>
      {kids}
    </Tag>
  );
}

/**
 * The product word appears letter by letter (≤500ms total). Plain inline spans: the heading's text and
 * accessible name stay exactly the word (scripts and screen readers read "Remesas"). Words wrap as words.
 */
export function LetterReveal({ text, className }: { text: string; className?: string }) {
  const letters = [...text];
  const step = Math.min(28, Math.floor(260 / Math.max(letters.length, 1)));
  let i = 0;
  return (
    <span className={cn("mx-letters", className)}>
      {text.split(/(\s+)/).map((word, w) =>
        /^\s+$/.test(word) ? (
          word
        ) : (
          <span key={w} className="inline-block whitespace-nowrap">
            {[...word].map((ch, k) => (
              <span key={k} style={{ "--i": i++, "--mx-step": `${step}ms` } as CSSProperties}>
                {ch}
              </span>
            ))}
          </span>
        ),
      )}
    </span>
  );
}

/**
 * A number that glides to each new value (ease-out, 420ms) instead of re-rendering with a jump. The first value
 * shows as is (never a fake count-up from zero); unknown renders `fallback`. Reduced motion: jumps.
 */
export function Ticker({ value, format, fallback = "—", className, duration = DUR.slow }: { value: number | undefined; format: (n: number) => string; fallback?: string; className?: string; duration?: number }) {
  const reduced = useReducedMotion();
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  useEffect(() => {
    if (value === undefined || from.current === undefined || reduced || from.current === value) {
      from.current = value;
      setShown(value);
      return;
    }
    const a = from.current;
    const t0 = performance.now();
    let raf = 0;
    const tick = (t: number) => {
      const k = Math.min(1, (t - t0) / duration);
      const e = 1 - (1 - k) ** 3; // ease-out cubic
      setShown(a + (value - a) * e);
      if (k < 1) raf = requestAnimationFrame(tick);
      else from.current = value;
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      from.current = value;
    };
  }, [value, reduced, duration]);
  return <span className={cn("tabular", className)}>{shown === undefined ? fallback : format(shown)}</span>;
}

/** The one signature success motion: a check that draws itself inside a soft accent ripple. */
export function SuccessCheck({ size = 56, className, label = "Done" }: { size?: number; className?: string; label?: string }) {
  return (
    <span className={cn("mx-success relative inline-grid place-items-center", className)} style={{ width: size, height: size }} role="img" aria-label={label}>
      <span className="mx-ripple absolute inset-0 rounded-full" aria-hidden />
      <svg viewBox="0 0 52 52" width={size} height={size} aria-hidden>
        <circle className="mx-draw" cx="26" cy="26" r="24" fill="none" stroke="currentColor" strokeWidth="2.5" pathLength={1} />
        <path className="mx-draw mx-draw-2" d="M15 27 l7 7 l15 -16" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" pathLength={1} />
      </svg>
    </span>
  );
}

/**
 * Ticks the number inside an already formatted string ("2,130,771", "260%", "US$1,250.00", "5.00% anual"),
 * keeping its prefix, suffix and decimals. Anything without a number (e.g. "—") renders as is.
 */
export function TickerText({ text, className }: { text: string; className?: string }) {
  const m = text.match(/^(\D*?)(-?\d[\d,]*(?:\.\d+)?)(.*)$/s);
  const value = m ? Number(m[2].replace(/,/g, "")) : undefined;
  const decimals = m?.[2].split(".")[1]?.length ?? 0;
  const grouped = !!m?.[2].includes(",");
  if (!m || value === undefined || !Number.isFinite(value)) return <span className={className}>{text}</span>;
  return (
    <Ticker
      className={className}
      value={value}
      format={(n) => `${m[1]}${n.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals, useGrouping: grouped })}${m[3]}`}
    />
  );
}
