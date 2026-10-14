"use client";
// Building blocks for the in-phone apps (crew/PRINCIPLES.md on the mobile.md v2 fintech structure):
// black pill buttons, hairlines, corners ≤8px, Archivo Black display + tiny uppercase meta, ink on
// white (or the "ink" theme). All live under .m-root (AndroidDevice), read --m-* tokens, 48dp targets.
import {
  forwardRef,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type CSSProperties,
  type PointerEvent,
  type ReactNode,
} from "react";
import { ArrowLeft, Check, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { haptic, initials } from "./format";

/* ───────────────────────── ripple / pressable ───────────────────────── */

/** Pointer-down handler that drops an M3 ripple into a `.m-press` element. */
export function ripple(e: PointerEvent<HTMLElement>, opts: { haptics?: boolean; centered?: boolean } = {}) {
  const el = e.currentTarget;
  if ((el as HTMLButtonElement).disabled) return;
  const r = el.getBoundingClientRect();
  const size = Math.hypot(r.width, r.height) * (opts.centered ? 1.1 : 2);
  const x = opts.centered ? r.width / 2 : e.clientX - r.left;
  const y = opts.centered ? r.height / 2 : e.clientY - r.top;
  const span = document.createElement("span");
  span.className = "m-ripple";
  Object.assign(span.style, { width: `${size}px`, height: `${size}px`, left: `${x - size / 2}px`, top: `${y - size / 2}px` });
  el.appendChild(span);
  const release = () => {
    span.classList.add("m-ripple-out");
    setTimeout(() => span.remove(), 520);
    window.removeEventListener("pointerup", release);
    window.removeEventListener("pointercancel", release);
  };
  window.addEventListener("pointerup", release);
  window.addEventListener("pointercancel", release);
  if (opts.haptics !== false) haptic();
}

type PressProps = ButtonHTMLAttributes<HTMLButtonElement> & { centeredRipple?: boolean };

/** Unstyled button with state layer + ripple + haptic tick. */
export const Pressable = forwardRef<HTMLButtonElement, PressProps>(function Pressable(
  { className, centeredRipple, onPointerDown, type = "button", ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn("m-press", className)}
      onPointerDown={(e) => {
        ripple(e, { centered: centeredRipple });
        onPointerDown?.(e);
      }}
      {...rest}
    />
  );
});

/* ───────────────────────── type ───────────────────────── */

/**
 * The display face: Archivo Black, uppercase, tight. Balances and screen titles.
 * `fit` shrinks the size so one line never overflows its column (large balances, narrow phones).
 */
export function Display({
  children,
  size = 44,
  fit,
  className,
  as: Tag = "p",
  style,
}: {
  children: ReactNode;
  size?: number;
  fit?: boolean;
  className?: string;
  as?: "p" | "h1" | "h2" | "span";
  style?: CSSProperties;
}) {
  const ref = useRef<HTMLElement>(null);
  const [px, setPx] = useState(size);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!fit || !el) return;
    const measure = () => {
      el.style.fontSize = `${size}px`;
      const avail = el.clientWidth;
      const need = el.scrollWidth;
      const next = need > avail && avail > 0 ? Math.max(18, Math.floor((size * avail) / need)) : size;
      el.style.fontSize = `${next}px`;
      setPx(next);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el.parentElement ?? el);
    const mo = new MutationObserver(measure);
    mo.observe(el, { childList: true, subtree: true, characterData: true });
    return () => {
      ro.disconnect();
      mo.disconnect();
    };
  }, [fit, size]);
  return (
    <Tag ref={ref as never} className={cn("m-display", fit && "overflow-hidden whitespace-nowrap", className)} style={{ fontSize: fit ? px : size, ...style }}>
      {children}
    </Tag>
  );
}

/** Tiny uppercase meta line ("■ 02 · REMESAS", "TESTNET · SIN VALOR REAL"). */
export function Meta({ children, className, style }: { children: ReactNode; className?: string; style?: CSSProperties }) {
  return (
    <p className={cn("m-meta", className)} style={style}>
      {children}
    </p>
  );
}

/** 1px hairline rule. */
export function Rule({ className }: { className?: string }) {
  return <hr className={cn("border-0 border-t border-[var(--m-outline-variant)]", className)} />;
}

/* ───────────────────────── buttons ───────────────────────── */

type Variant = "filled" | "accent" | "tonal" | "outlined" | "text" | "dark";
const DISABLED = "disabled:bg-[var(--m-surface-2)] disabled:text-[var(--m-on-surface-variant)] disabled:border-transparent";
const VARIANT: Record<Variant, string> = {
  // the black pill (inverts on the ink theme)
  filled: `bg-[var(--m-inverse)] text-[var(--m-on-inverse)] ${DISABLED}`,
  dark: `bg-[var(--m-inverse)] text-[var(--m-on-inverse)] ${DISABLED}`,
  accent: `bg-[var(--m-accent)] text-[var(--m-on-accent)] ${DISABLED}`,
  tonal: `bg-[var(--m-surface-2)] text-[var(--m-on-surface)] ${DISABLED}`,
  outlined: "border border-[var(--m-outline)] text-[var(--m-on-surface)] disabled:opacity-40",
  text: "text-[var(--m-on-surface)] underline-offset-4 hover:underline disabled:opacity-40",
};

export function Button({
  variant = "filled",
  size = "lg",
  loading,
  icon,
  className,
  children,
  ...rest
}: PressProps & { variant?: Variant; size?: "md" | "lg"; loading?: boolean; icon?: ReactNode }) {
  return (
    <Pressable
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-full font-semibold tracking-[0.06em] uppercase",
        size === "lg" ? "h-[52px] px-6 text-[13.5px]" : "h-10 px-5 text-[12.5px]",
        VARIANT[variant],
        className,
      )}
      {...rest}
    >
      {loading ? <Loader2 className="size-[18px] animate-spin" /> : icon}
      {children}
    </Pressable>
  );
}

export function IconButton({ label, className, children, ...rest }: PressProps & { label: string }) {
  return (
    <Pressable aria-label={label} title={label} centeredRipple className={cn("grid size-12 shrink-0 place-items-center rounded-full", className)} {...rest}>
      {children}
    </Pressable>
  );
}

/** Round action: a 56dp circle with a short label underneath (fintech action row). */
export function RoundAction({ icon, label, onClick, primary, disabled }: { icon: ReactNode; label: string; onClick: () => void; primary?: boolean; disabled?: boolean }) {
  return (
    <Pressable onClick={onClick} disabled={disabled} className="grid content-start justify-items-center gap-2 rounded-[8px] px-1 py-1.5 disabled:opacity-40">
      <span
        className={cn(
          "grid size-14 place-items-center rounded-full [&_svg]:size-[22px] [&_svg]:stroke-[1.75]",
          primary ? "bg-[var(--m-accent)] text-[var(--m-on-accent)]" : "border border-[var(--m-outline)] text-[var(--m-on-surface)]",
        )}
      >
        {icon}
      </span>
      <span className="text-center text-[13px] leading-tight font-medium">{label}</span>
    </Pressable>
  );
}

/** Extended FAB: a black pill with an icon. */
export function Fab({ icon, children, className, ...rest }: PressProps & { icon: ReactNode }) {
  return (
    <Pressable className={cn("inline-flex h-14 items-center gap-3 rounded-full bg-[var(--m-inverse)] px-6 text-[14px] font-semibold tracking-[0.04em] text-[var(--m-on-inverse)] uppercase", className)} {...rest}>
      {icon}
      {children}
    </Pressable>
  );
}

/* ───────────────────────── app bar / nav ───────────────────────── */

/** Top app bar: back arrow, display title, optional meta line above it, actions. Spanish only. */
export function TopAppBar({
  title,
  sub,
  onBack,
  actions,
  className,
  style,
}: {
  title: ReactNode;
  /** tiny uppercase meta under the title */
  sub?: ReactNode;
  onBack?: () => void;
  actions?: ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <header className={cn("sticky top-0 z-10 flex min-h-16 items-center gap-1 bg-[var(--m-surface)] px-1", !onBack && "pl-4", className)} style={style}>
      {onBack && (
        <IconButton label="Atrás" onClick={onBack}>
          <ArrowLeft className="size-6" strokeWidth={1.75} />
        </IconButton>
      )}
      <div className="min-w-0 flex-1">
        <h2 className="m-display truncate text-[22px] leading-none">{title}</h2>
        {sub && <p className="m-meta mt-1 truncate">{sub}</p>}
      </div>
      {actions && <div className="flex items-center">{actions}</div>}
    </header>
  );
}

export type NavItem<T extends string> = { id: T; label: string; icon: ReactNode; href?: string };

/** Bottom nav: 4 icons, labels, a small accent dot under the active one. Hairline on top. */
export function BottomNav<T extends string>({ items, value, onChange }: { items: NavItem<T>[]; value: T; onChange: (id: T) => void }) {
  return (
    <nav className="relative z-10 grid h-[72px] grid-flow-col border-t border-[var(--m-outline-variant)] bg-[var(--m-surface)] sm:sticky sm:bottom-0 sm:-mb-5 sm:h-[92px] sm:pb-5" aria-label="Navegación">
      {items.map((it) => {
        const on = it.id === value;
        const body = (
          <>
            <span className={cn("[&_svg]:size-6 [&_svg]:stroke-[1.75]", on ? "text-[var(--m-on-surface)]" : "text-[var(--m-on-surface-variant)]")}>{it.icon}</span>
            <span className={cn("text-[12px] tracking-[0.02em]", on ? "font-semibold text-[var(--m-on-surface)]" : "font-medium text-[var(--m-on-surface-variant)]")}>{it.label}</span>
            <span className={cn("size-1 rounded-full transition-opacity duration-200", on ? "opacity-100" : "opacity-0")} style={{ background: "var(--m-accent)" }} />
          </>
        );
        const cls = "grid content-center justify-items-center gap-1";
        return it.href ? (
          <a key={it.id} href={it.href} className={cls} onClick={() => haptic()}>
            {body}
          </a>
        ) : (
          <button
            key={it.id}
            type="button"
            aria-current={on ? "page" : undefined}
            onClick={() => {
              haptic();
              onChange(it.id);
            }}
            className={cls}
          >
            {body}
          </button>
        );
      })}
    </nav>
  );
}

/* ───────────────────────── lists, avatars, chips ───────────────────────── */

// Cultural palette tones (PRINCIPLES §2): cream, jade, terracotta, cobalt, rosa, maize.
const AVATAR_TONES = ["#f2e6c9", "#1f3d2b", "#e2603f", "#2448c8", "#d93a7a", "#e5a823"];
const AVATAR_INK = ["#0a0a0a", "#f2e6c9", "#ffffff", "#ffffff", "#ffffff", "#0a0a0a"];

/** Initials avatar with a stable cultural color per name. */
export function Avatar({ name, size = 40, className, children }: { name: string; size?: number; className?: string; children?: ReactNode }) {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const i = h % AVATAR_TONES.length;
  return (
    <span
      aria-hidden
      className={cn("m-display grid shrink-0 place-items-center rounded-full", className)}
      style={{ width: size, height: size, background: AVATAR_TONES[i], color: AVATAR_INK[i], fontSize: size * 0.38, lineHeight: 1 }}
    >
      {children ?? initials(name)}
    </span>
  );
}

/** Bank-style row: 64dp, round leading, title + subtitle, amount right-aligned. Hairline optional. */
export function ListItem({
  leading,
  headline,
  supporting,
  trailing,
  trailingSub,
  trailingTone,
  onClick,
  href,
  divider,
  className,
  disabled,
}: {
  leading?: ReactNode;
  headline: ReactNode;
  supporting?: ReactNode;
  trailing?: ReactNode;
  trailingSub?: ReactNode;
  /** "in" = money in (green, +), default = money out / neutral */
  trailingTone?: "in" | "out";
  onClick?: () => void;
  href?: string;
  divider?: boolean;
  className?: string;
  disabled?: boolean;
}) {
  const body = (
    <>
      {leading}
      <span className="min-w-0 flex-1 text-left">
        <span className="block truncate text-[16px] leading-6 font-medium">{headline}</span>
        {supporting && <span className="block truncate text-[13.5px] leading-5 text-[var(--m-on-surface-variant)]">{supporting}</span>}
      </span>
      {(trailing || trailingSub) && (
        <span className="shrink-0 text-right">
          {trailing && <span className={cn("m-num block text-[16px] leading-6 font-semibold", trailingTone === "in" && "text-[var(--m-success)]")}>{trailing}</span>}
          {trailingSub && <span className="block text-[13px] leading-5 text-[var(--m-on-surface-variant)]">{trailingSub}</span>}
        </span>
      )}
    </>
  );
  const cls = cn("flex w-full items-center gap-3.5 px-4", supporting ? "min-h-16 py-2" : "min-h-14 py-1", divider && "border-b border-[var(--m-outline-variant)]", className);
  if (href)
    return (
      <a href={href} target="_blank" rel="noreferrer" className={cn("m-press", cls)} onPointerDown={(e) => ripple(e)}>
        {body}
      </a>
    );
  if (onClick)
    return (
      <Pressable className={cls} onClick={onClick} disabled={disabled}>
        {body}
      </Pressable>
    );
  return <div className={cls}>{body}</div>;
}

/** Section header: tiny uppercase meta + optional action ("MOVIMIENTOS · VER TODO"). */
export function ListHeader({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex min-h-11 items-end justify-between px-4 pt-4 pb-1">
      <p className="m-meta text-[var(--m-on-surface)]">{children}</p>
      {action}
    </div>
  );
}

/** Pill chip: outlined ink, filled ink when selected. 48dp hit area. */
export function Chip({ selected, children, icon, className, ...rest }: PressProps & { selected?: boolean; icon?: ReactNode }) {
  return (
    <Pressable
      aria-pressed={selected}
      className={cn(
        "relative inline-flex h-9 items-center gap-1.5 rounded-full border px-4 text-[14px] font-medium",
        "after:absolute after:inset-x-0 after:-inset-y-1.5 after:content-['']",
        selected ? "border-[var(--m-inverse)] bg-[var(--m-inverse)] text-[var(--m-on-inverse)]" : "border-[var(--m-outline)] text-[var(--m-on-surface)]",
        "disabled:opacity-40",
        className,
      )}
      {...rest}
    >
      {selected ? <Check className="size-4" strokeWidth={2.25} /> : icon}
      {children}
    </Pressable>
  );
}

/* ───────────────────────── status, honesty, feedback ───────────────────────── */

/** Small precise honesty label ("DEMO", "SIMULADO", "TESTNET · SIN VALOR REAL"). */
export function DemoBadge({ children = "Demo", tone = "neutral", className }: { children?: ReactNode; tone?: "neutral" | "accent" | "onAccent"; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-[22px] shrink-0 items-center gap-1 rounded-[2px] border px-1.5 text-[11px] font-semibold tracking-[0.08em] uppercase",
        tone === "neutral" && "border-[var(--m-outline-variant)] text-[var(--m-on-surface-variant)]",
        tone === "accent" && "border-transparent bg-[var(--m-accent-container)] text-[var(--m-on-accent-container)]",
        tone === "onAccent" && "border-current/40 text-current",
        className,
      )}
    >
      {children}
    </span>
  );
}

/** The quiet honesty line on money screens (tiny meta, Spanish). */
export function HonestyNote({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn("m-meta px-4", className)}>{children}</p>;
}

/** Inline message: a thin left rule, no box. */
export function Banner({ tone = "info", icon, children, action }: { tone?: "info" | "error" | "success"; icon?: ReactNode; children: ReactNode; action?: ReactNode }) {
  return (
    <div
      role={tone === "error" ? "alert" : undefined}
      className={cn(
        "flex items-start gap-3 border-l-2 py-1 pl-3 text-[14px] leading-[1.4]",
        tone === "info" && "border-[var(--m-on-surface)] text-[var(--m-on-surface)]",
        tone === "error" && "border-[var(--m-error)] text-[var(--m-error)]",
        tone === "success" && "border-[var(--m-success)] text-[var(--m-success)]",
      )}
    >
      {icon && <span className="mt-px shrink-0 [&_svg]:size-[18px]">{icon}</span>}
      <div className="min-w-0 flex-1">{children}</div>
      {action}
    </div>
  );
}

export function Skeleton({ className, style }: { className?: string; style?: CSSProperties }) {
  return <span aria-hidden className={cn("m-skeleton block rounded-[4px]", className)} style={style} />;
}

/** A list of skeleton rows while data loads. */
export function SkeletonList({ rows = 3 }: { rows?: number }) {
  return (
    <div className="grid" aria-busy="true" aria-label="Cargando">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex min-h-16 items-center gap-3.5 px-4">
          <Skeleton className="size-10 rounded-full" />
          <span className="grid flex-1 gap-2">
            <Skeleton className="h-3.5 w-3/5" />
            <Skeleton className="h-3 w-2/5" />
          </span>
          <Skeleton className="h-3.5 w-14" />
        </div>
      ))}
    </div>
  );
}

/** Thin indeterminate progress line (top of a busy screen). */
export function LinearProgress({ className }: { className?: string }) {
  return <div role="progressbar" aria-label="Procesando" className={cn("m-progress h-[3px] w-full", className)} />;
}

/** Empty state: drawing, statement, action. */
export function EmptyState({ icon, title, hint, action }: { icon: ReactNode; title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="grid justify-items-center gap-2 px-8 py-8 text-center">
      <span className="grid size-16 place-items-center text-[var(--m-on-surface)] [&_svg]:size-12">{icon}</span>
      <p className="m-display text-[22px]">{title}</p>
      {hint && <p className="text-[14px] text-[var(--m-on-surface-variant)]">{hint}</p>}
      {action}
    </div>
  );
}

/* ───────────────────────── switch ───────────────────────── */

/** Switch: 52×32 pill track, ink when on. 48dp hit area. */
export function Switch({ checked, onChange, disabled, label }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => {
        haptic();
        onChange(!checked);
      }}
      className="group relative grid h-12 w-[60px] shrink-0 place-items-center disabled:opacity-40"
    >
      <span
        className={cn(
          "relative h-8 w-[52px] rounded-full border-2 transition-colors duration-200",
          checked ? "border-[var(--m-accent)] bg-[var(--m-accent)]" : "border-[var(--m-on-surface-variant)] bg-transparent",
        )}
      >
        <span
          className={cn(
            "absolute top-1/2 grid -translate-y-1/2 place-items-center rounded-full transition-all duration-200 ease-[cubic-bezier(0.2,0,0,1)]",
            checked ? "left-[22px] size-6 bg-[var(--m-on-accent)] text-[var(--m-accent)]" : "left-[4px] size-4 bg-[var(--m-on-surface-variant)]",
          )}
        >
          {checked && <Check className="size-4" strokeWidth={3} />}
        </span>
      </span>
    </button>
  );
}

/* ───────────────────────── motion helpers ───────────────────────── */

/** Remembers the previous screen and says whether we moved forward or back in `order`. */
export function useNavDirection<T extends string>(screen: T, order: readonly T[]): "fwd" | "back" {
  const prev = useRef(screen);
  const [dir, setDir] = useState<"fwd" | "back">("fwd");
  useEffect(() => {
    if (prev.current !== screen) {
      setDir(order.indexOf(screen) >= order.indexOf(prev.current) ? "fwd" : "back");
      prev.current = screen;
    }
  }, [screen, order]);
  return order.indexOf(screen) >= order.indexOf(prev.current) ? "fwd" : dir;
}

/** Re-mounts its child with a short shared-axis slide whenever `id` changes. */
export function ScreenTransition({ id, dir = "fwd", children, className }: { id: string; dir?: "fwd" | "back" | "fade"; children: ReactNode; className?: string }) {
  return (
    <div key={id} className={cn(dir === "fwd" ? "m-enter-fwd" : dir === "back" ? "m-enter-back" : "m-enter-fade", "flex min-h-full flex-col", className)}>
      {children}
    </div>
  );
}

/** Counts a number up to `value` once (number tick-up), then follows it. */
export function TickUp({ value, format, ms = 700 }: { value: number | undefined; format: (n: number) => string; ms?: number }) {
  const [shown, setShown] = useState<number>();
  const from = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (value === undefined) return;
    const start = from.current ?? 0;
    from.current = value;
    if (start === value || typeof window === "undefined" || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return setShown(value);
    const t0 = performance.now();
    let raf = 0;
    const step = (t: number) => {
      const k = Math.min(1, (t - t0) / ms);
      const e = 1 - Math.pow(1 - k, 3);
      setShown(start + (value - start) * e);
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value, ms]);
  return <>{shown === undefined ? "—" : format(shown)}</>;
}

/** The success mark: a disc pops in, the tick draws, one soft ring. */
export function SuccessCheck({ size = 88, color }: { size?: number; color?: string }) {
  const c = color ?? "var(--m-accent)";
  return (
    <span className="relative grid place-items-center" style={{ width: size, height: size }} role="img" aria-label="Listo">
      <span className="m-check-ring absolute inset-0 rounded-full" style={{ background: c }} />
      <span className="m-check-disc absolute inset-0 rounded-full" style={{ background: c }} />
      <svg viewBox="0 0 24 24" className="relative" style={{ width: size * 0.5, height: size * 0.5 }} fill="none" stroke="var(--m-on-accent)" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round">
        <path className="m-check-tick" d="M5 12.5l4.5 4.5L19 7.5" />
      </svg>
    </span>
  );
}

/** Success layout: check, display statement, big amount, details, black pill pinned low. */
export function SuccessScreen({ title, amount, caption, children, action }: { title: ReactNode; amount?: ReactNode; caption?: ReactNode; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex min-h-full flex-col px-5 pt-12 pb-6">
      <SuccessCheck size={72} />
      <p className="m-display m-rise mt-8 text-[34px]" style={{ animationDelay: "250ms" }}>
        {title}
      </p>
      {amount && (
        <p className="m-display m-rise mt-3 text-[46px]" style={{ animationDelay: "320ms", color: "var(--m-accent)" }}>
          {amount}
        </p>
      )}
      {caption && (
        <p className="m-meta m-rise mt-3" style={{ animationDelay: "380ms" }}>
          {caption}
        </p>
      )}
      {children && (
        <div className="m-rise mt-6 w-full" style={{ animationDelay: "440ms" }}>
          {children}
        </div>
      )}
      {action && <div className="mt-auto w-full pt-6">{action}</div>}
    </div>
  );
}

/** Label/value rows on receipts: hairlines, no box. */
export function DetailRows({ rows }: { rows: { label: ReactNode; value: ReactNode; sub?: ReactNode }[] }) {
  return (
    <dl className="grid border-t border-[var(--m-outline-variant)]">
      {rows.map((r, i) => (
        <div key={i} className="flex items-start justify-between gap-3 border-b border-[var(--m-outline-variant)] py-3">
          <dt className="m-meta pt-0.5">{r.label}</dt>
          <dd className="min-w-0 text-right">
            <span className="m-num block text-[15px] font-semibold break-words">{r.value}</span>
            {r.sub && <span className="block text-[13px] text-[var(--m-on-surface-variant)]">{r.sub}</span>}
          </dd>
        </div>
      ))}
    </dl>
  );
}
