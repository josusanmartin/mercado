"use client";
// v5 motion kit (crew/PRINCIPLES.md §v5): transform/opacity only, ease-out cubic-bezier(.2,.8,.2,1), 180–420ms,
// never bouncy. Pure CSS keyframes (globals.css "v5 motion") driven by a few tiny components; no dependency.
// prefers-reduced-motion collapses everything to the final state (the CSS does it; Ticker jumps).
// Nothing here delays a primary action: elements are clickable while they animate, and nothing shifts layout.
// Nothing ever RESTS hidden: every entrance is a CSS animation that ends visible without JS.
import { Children, createContext, isValidElement, useEffect, useRef, useState, useSyncExternalStore, type CSSProperties, type ElementType, type ReactNode } from "react";
import { Check, Copy } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export const EASE = "cubic-bezier(.2,.8,.2,1)";

/** V6-TASTE #6: true only on the tab's first page; after a client-side navigation titles render whole (no letters). */
export const FreshLanding = createContext(true);
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

/**
 * Fade-up as it renders. Pure CSS: content never waits on JS to become visible (P0, lead 05:22).
 * V5-TASTE #3 "one entrance owner per page": inside the page's route group (.mx-enter) Reveal and Stagger do
 * NOT animate again (globals.css); use them only for content that arrives on its own outside that group.
 */
export function Reveal({ children, delay = 0, as: Tag = "div", className }: { children: ReactNode; delay?: number; as?: ElementType; className?: string }) {
  return (
    <Tag className={cn("mx-reveal", className)} style={{ "--mx-delay": `${delay}ms` } as CSSProperties}>
      {children}
    </Tag>
  );
}

/** Children fade up one after another (40ms apart, capped at 12). Pure CSS. Works on lists: as="ul"/"ol". */
export function Stagger({ children, as: Tag = "div", className, step = 40 }: { children: ReactNode; as?: ElementType; className?: string; step?: number }) {
  let i = 0;
  const kids = Children.map(children, (c) =>
    isValidElement<{ style?: CSSProperties }>(c) ? { ...c, props: { ...c.props, style: { ...c.props.style, "--i": Math.min(i++, 12), "--mx-step": `${step}ms` } as CSSProperties } } : c,
  );
  return <Tag className={cn("mx-stagger", className)}>{kids}</Tag>;
}

/**
 * The short product word appears letter by letter. V5-TASTE #3: the delay budget is capped at 140ms so with a
 * 360ms letter animation the last letter is readable by 500ms. A11y: the letters are aria-hidden and a
 * visually-hidden copy carries the word, so screen readers and the accessible name get "Remesas", never
 * single letters. Use it for short product words only; long or utility titles render plainly.
 */
export function LetterReveal({ text, className }: { text: string; className?: string }) {
  const n = [...text.replace(/\s+/g, "")].length;
  const step = Math.min(28, Math.floor(140 / Math.max(n - 1, 1)));
  let i = 0;
  return (
    <span className={className}>
      <span className="sr-only">{text}</span>
      <span className="mx-letters" aria-hidden>
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

// ───────────────────────────── v6 · Show, don't tell (crew/PRINCIPLES.md §v6) ─────────────────────────────

/**
 * <Pulse value={x}>: flashes an accent wash once whenever `value` changes (never on first render). The flash is
 * an overlay that fades to nothing (pure CSS); reduced motion: no flash.
 */
export function Pulse({ value, children, className }: { value: unknown; children: ReactNode; className?: string }) {
  const first = useRef(true);
  const prev = useRef(value);
  const [n, setN] = useState(0);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      prev.current = value;
      return;
    }
    if (!Object.is(prev.current, value)) {
      prev.current = value;
      setN((k) => k + 1);
    }
  }, [value]);
  return (
    <span className={cn("relative inline-block", className)}>
      {children}
      {n > 0 && <span key={n} aria-hidden className="mx-pulse-flash pointer-events-none absolute -inset-x-1.5 -inset-y-0.5 rounded-[4px]" />}
    </span>
  );
}

export type FlowNode = { label: ReactNode; value?: ReactNode; sub?: ReactNode };
export type FlowState = "idle" | "quoted" | "pending" | "confirmed" | "failed";

/** Pauses CSS loops while the element is offscreen (data-offscreen); no-op without IntersectionObserver. */
function useOffscreen<T extends Element>() {
  const ref = useRef<T>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([e]) => el.toggleAttribute("data-offscreen", !e.isIntersecting));
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return ref;
}

/**
 * <FlowPath nodes state>: a horizontal money flow A → B → C whose motion describes STATE (V6-TASTE #2):
 *   idle      dashed, quiet (nothing chosen yet)
 *   quoted    a still, solid path (a quote moves no money)
 *   pending   a marker travels at constant speed (linear) while the transfer is in flight; paused offscreen
 *   confirmed one ~450ms arrival (shared ease-out), then still at the destination
 *   failed    the path stops at `failedAt` (node index) with a failure mark
 * Reduced motion shows each state's final frame. `active` is the v6 alias for "pending" (kept for callers).
 */
export function FlowPath({
  nodes,
  state,
  active,
  failedAt,
  className,
  label,
}: {
  nodes: FlowNode[];
  state?: FlowState;
  /** @deprecated use state="pending" */
  active?: boolean;
  failedAt?: number;
  className?: string;
  label?: string;
}) {
  const st: FlowState = state ?? (active ? "pending" : "idle");
  const ref = useOffscreen<HTMLElement>();
  const n = Math.max(nodes.length, 2);
  const inset = `${50 / n}%`;
  const solid = st !== "idle";
  const stop = st === "failed" ? Math.min(Math.max(failedAt ?? 0, 0), n - 1) : n - 1;
  const reach = n > 1 ? stop / (n - 1) : 1; // share of the track that is lit
  return (
    <figure ref={ref} data-state={st} className={cn("grid gap-3", className)} aria-label={label}>
      <div className="relative h-4" aria-hidden>
        <span className="absolute top-1/2 -translate-y-1/2 border-t-2 border-dashed border-current/25" style={{ left: inset, right: inset }} />
        {solid && (
          <span
            className="absolute top-1/2 h-0.5 origin-left -translate-y-1/2 bg-[var(--accent)]"
            style={{ left: inset, right: inset, transform: `translateY(-50%) scaleX(${reach})` }}
          />
        )}
        {(st === "pending" || st === "confirmed") && (
          <span className="absolute inset-y-0 overflow-hidden" style={{ left: inset, right: inset }}>
            <span data-loop={st === "pending" || undefined} className={cn("absolute inset-y-0 left-0 w-full", st === "pending" ? "mx-flow-dot" : "mx-flow-arrive")}>
              <span className="absolute top-1/2 right-0 size-2.5 -translate-y-1/2 translate-x-1/2 rounded-full bg-[var(--accent)] ring-4 ring-[color-mix(in_oklab,var(--accent)_25%,transparent)]" />
            </span>
          </span>
        )}
        {nodes.map((_, i) => {
          const lit = solid && i <= stop;
          const failedHere = st === "failed" && i === stop;
          const arrived = st === "confirmed" && i === n - 1;
          return (
            <span
              key={i}
              className={cn(
                "absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2",
                failedHere ? "border-[var(--destructive)] bg-[var(--destructive)]" : arrived ? "border-[var(--accent)] bg-[var(--accent)]" : lit ? "border-[var(--accent)] bg-background" : "border-current/40 bg-background",
              )}
              style={{ left: `${((i + 0.5) / n) * 100}%` }}
            />
          );
        })}
      </div>
      <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }}>
        {nodes.map((node, i) => (
          <div key={i} className="grid min-w-0 justify-items-center gap-0.5 text-center">
            <span className="text-muted-foreground text-[13px]">{node.label}</span>
            {node.value !== undefined && <span className="text-[17px] leading-tight font-semibold tabular">{node.value}</span>}
            {node.sub !== undefined && <span className="text-muted-foreground text-[12px] leading-snug">{node.sub}</span>}
          </div>
        ))}
      </div>
    </figure>
  );
}

/** <Stepper steps current>: progress steps. Done = filled accent, current = pulsing ring; the bar fills by transform. */
export function Stepper({ steps, current, className, label = "Progress" }: { steps: { label: ReactNode; sub?: ReactNode }[]; current: number; className?: string; label?: string }) {
  const n = steps.length;
  const progress = n > 1 ? Math.min(Math.max(current, 0), n - 1) / (n - 1) : 1;
  return (
    <ol className={cn("relative grid gap-2", className)} aria-label={label} style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }}>
      <span aria-hidden className="bg-border absolute top-[7px] h-0.5" style={{ left: `${50 / n}%`, right: `${50 / n}%` }} />
      <span
        aria-hidden
        className="mx-step-bar absolute top-[7px] h-0.5 origin-left bg-[var(--accent)]"
        style={{ left: `${50 / n}%`, right: `${50 / n}%`, transform: `scaleX(${progress})` }}
      />
      {steps.map((s, i) => {
        const state = i < current ? "done" : i === current ? "current" : "todo";
        return (
          <li key={i} aria-current={state === "current" ? "step" : undefined} className="relative grid justify-items-center gap-1 text-center">
            <span
              aria-hidden
              className={cn(
                "relative z-10 size-4 rounded-full border-2",
                state === "done" && "border-[var(--accent)] bg-[var(--accent)]",
                state === "current" && "mx-step-current border-[var(--accent)] bg-background",
                state === "todo" && "border-border bg-background",
              )}
            />
            <span className={cn("text-[13px] leading-tight font-semibold", state === "todo" && "text-muted-foreground")}>{s.label}</span>
            {s.sub && <span className="text-muted-foreground text-[12px] leading-snug">{s.sub}</span>}
          </li>
        );
      })}
    </ol>
  );
}

/** <Spark values>: a tiny sparkline in the accent; draws once, ends on a dot. Needs ≥2 values. */
export function Spark({ values, className, label }: { values: number[]; className?: string; label?: string }) {
  const W = 120;
  const H = 32;
  if (values.length < 2) return null;
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const span = hi - lo || 1;
  const pts = values.map((v, i) => [(i / (values.length - 1)) * (W - 4) + 2, H - 3 - ((v - lo) / span) * (H - 6)] as const);
  const d = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
  const [lx, ly] = pts[pts.length - 1];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={cn("h-8 w-[7.5rem] text-[var(--accent)]", className)} role={label ? "img" : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
      <path className="mx-draw" d={d} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" pathLength={1} />
      <circle cx={lx} cy={ly} r="2.6" fill="currentColor" />
    </svg>
  );
}

/**
 * <CopyAddress address>: the short address and a copy icon. V6-TASTE #12: a 44px touch target on phones, a
 * stable-width check for 1.4s, a "Copied" toast; if the clipboard is unavailable, the FULL address appears
 * selected so it can be copied by hand (the shortened one can't be). The explorer link stays separate.
 */
export function CopyAddress({
  address,
  className,
  label,
  locale,
  onCopied,
  onFailed,
}: {
  address: string;
  className?: string;
  label?: string;
  /** "es": Spanish name/fallback for the in-phone apps (Spanish only). Default English. */
  locale?: "es";
  /** Replaces the "Copied" toast (e.g. the phone's own snackbar). */
  onCopied?: (short: string) => void;
  /** Replaces the error toast; the full address is still shown selected. */
  onFailed?: () => void;
}) {
  const [done, setDone] = useState(false);
  const [manual, setManual] = useState(false);
  const full = useRef<HTMLSpanElement>(null);
  const short = address.length > 12 ? `${address.slice(0, 6)}…${address.slice(-4)}` : address;
  useEffect(() => {
    if (!manual || !full.current) return;
    const range = document.createRange();
    range.selectNodeContents(full.current);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
  }, [manual]);
  async function copy() {
    try {
      await navigator.clipboard.writeText(address);
      setDone(true);
      if (onCopied) onCopied(short);
      else toast.success("Copied", { description: short, duration: 1600 });
      setTimeout(() => setDone(false), 1400);
    } catch {
      setManual(true);
      if (onFailed) onFailed();
      else toast.error(locale === "es" ? "No se pudo copiar. La dirección completa está seleccionada: cópiala a mano." : "Couldn't copy. The full address is selected: copy it by hand.");
    }
  }
  return (
    <span className={cn("inline-flex flex-wrap items-center gap-x-1.5", className)}>
      <button
        type="button"
        onClick={copy}
        title={address}
        aria-label={locale === "es" ? `Copiar ${label ?? "dirección"} ${address}` : `Copy ${label ?? "address"} ${address}`}
        className="hover:text-foreground focus-visible:text-foreground inline-flex min-h-11 items-center gap-1.5 rounded-[4px] font-mono text-[13px] tabular transition-colors sm:min-h-0"
      >
        {short}
        {/* Fixed 14px slot: the icon swaps without changing the width. */}
        <span className="inline-grid size-3.5 place-items-center" aria-hidden>
          {done ? <Check className="size-3.5 text-[var(--success)]" /> : <Copy className="size-3.5" />}
        </span>
      </button>
      {manual && (
        <span ref={full} className="font-mono text-[12px] break-all select-all">
          {address}
        </span>
      )}
    </span>
  );
}
