"use client";
// Building blocks for the in-phone apps (crew/PRINCIPLES.md on the mobile.md v2 fintech structure):
// black pill buttons, hairlines, corners ≤8px, Archivo Black display + tiny uppercase meta, ink on
// white (or the "ink" theme). All live under .m-root (AndroidDevice), read --m-* tokens, 48dp targets.
import {
  forwardRef,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type CSSProperties,
  type PointerEvent,
  type ReactNode,
} from "react";
import { ArrowLeft, Check, Loader2 } from "lucide-react";
import { DUR, SuccessCheck as MotionCheck, Ticker, useReducedMotion } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { fmtMoney, haptic, initials } from "./format";

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
 * `fit` shrinks the size so one line never overflows its column (large balances, narrow phones). Money is
 * never clipped or ellipsized (review #19): below the smallest size it wraps instead.
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
      el.style.whiteSpace = el.style.flexWrap = "nowrap";
      const avail = el.clientWidth;
      const need = el.scrollWidth;
      const next = need > avail && avail > 0 ? Math.max(14, Math.floor((size * avail) / need)) : size;
      el.style.fontSize = `${next}px`;
      // Still too wide at the smallest size: wrap (flex balances too), never clip.
      if (el.scrollWidth > el.clientWidth) {
        el.style.whiteSpace = "normal";
        el.style.flexWrap = "wrap";
      }
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
    <Tag ref={ref as never} className={cn("m-display", fit && "break-words whitespace-nowrap", className)} style={{ fontSize: fit ? px : size, ...style }}>
      {children}
    </Tag>
  );
}

/**
 * Tiny uppercase meta line ("■ 02 · REMESAS", "TESTNET · SIN VALOR REAL"). Either children, or `parts`
 * joined with middle dots plus an optional colored `mark` square (same API as mobile2's editorial Meta).
 */
export function Meta({
  children,
  parts,
  mark,
  honesty,
  className,
  style,
}: {
  children?: ReactNode;
  parts?: (ReactNode | false | undefined | null)[];
  mark?: string;
  /** A disclaimer line: hidden only by the ?present=1 capture mode. */
  honesty?: boolean;
  className?: string;
  style?: CSSProperties;
}) {
  const items = (parts ?? []).filter((p) => p !== false && p !== undefined && p !== null && p !== "");
  if (!parts && !mark)
    return (
      <p data-honesty={honesty ? "" : undefined} className={cn("m-meta", className)} style={style}>
        {children}
      </p>
    );
  return (
    <p data-honesty={honesty ? "" : undefined} className={cn("m-meta flex flex-wrap items-center gap-x-1.5", className)} style={style}>
      {mark && <span aria-hidden className="inline-block size-[7px]" style={{ background: mark }} />}
      {children}
      {items.map((p, i) => (
        <span key={i} className="whitespace-nowrap">
          {p}
          {i < items.length - 1 && <span aria-hidden className="ml-1.5">·</span>}
        </span>
      ))}
    </p>
  );
}

/** The full in-app disclosure, persistent in every app header (R-019: the site footer hides in phone mode). */
export const APP_HONESTY = "Testnet · sin valor real · no canjeable";

/**
 * Every app's first row, on every screen and state: "■ 02 · REMESAS · TESTNET · SIN VALOR REAL · NO
 * CANJEABLE" (accent square, site index) + a right slot (avatar, bell). The honesty part carries
 * data-honesty (hidden only by the ?present=1 capture mode), with its leading dot inside.
 */
export function AppHeader({ index, product, right, honesty = APP_HONESTY }: { index: string; product: string; right?: ReactNode; honesty?: string | false }) {
  return (
    <header className="flex min-h-14 items-center gap-2 py-2 pr-3 pl-4">
      <p className="m-meta min-w-0 flex-1 text-[var(--m-on-surface)]">
        <span aria-hidden className="mr-1.5 inline-block size-[7px] align-[1px]" style={{ background: "var(--m-accent)" }} />
        {index} · {product}
        {honesty && (
          <span data-honesty className="text-[var(--m-on-surface-variant)]">
            {" "}
            · {honesty}
          </span>
        )}
      </p>
      {right}
    </header>
  );
}

/** The balance label row: the label, and (opt-in) a compact honesty pill. AppHeader already discloses. */
export function BalanceHead({ label, honesty }: { label: ReactNode; honesty?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <Meta>{label}</Meta>
      {honesty && <DemoBadge>{honesty}</DemoBadge>}
    </div>
  );
}

/**
 * The one big balance: "US$1,250" in the display face with ".00" smaller (fintech style), fit to one
 * line. It glides from its previous value to each new one like @/lib/motion's Ticker (the first value shows
 * as is, never a count-up from 0; reduced motion jumps). `currency` picks the prefix (US$ / MX$); pass a
 * number (units) or a 6dp bigint.
 */
export function Money({
  value,
  currency = "MXN",
  size = 48,
  digits = 2,
  className,
  style,
}: {
  value: bigint | number | undefined;
  currency?: "USD" | "MXN";
  size?: number;
  digits?: number;
  className?: string;
  style?: CSSProperties;
}) {
  const n = useTickUp(typeof value === "bigint" ? Number(value) / 1e6 : value);
  const s = fmtMoney(n, digits);
  const neg = s.startsWith("-");
  const [int, dec] = s.replace(/^-?\$/, "").split(".");
  return (
    <Display fit size={size} className={cn("flex items-baseline", className)} style={style}>
      {s === "—" ? (
        <span className="text-[var(--m-surface-3)]">—</span>
      ) : (
        <>
          <span>
            {neg && "−"}
            {currency === "USD" ? "US$" : "MX$"}
            {int}
          </span>
          {dec && <span className="text-[0.46em]">.{dec}</span>}
        </>
      )}
    </Display>
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
export function RoundAction({
  icon,
  label,
  onClick,
  primary,
  disabled,
  badge,
}: {
  icon: ReactNode;
  label: string;
  onClick: () => void;
  primary?: boolean;
  disabled?: boolean;
  /** A small second line under the label ("Próximamente"). The button's name stays `label`; this describes it. */
  badge?: string;
}) {
  const id = useId();
  return (
    <Pressable
      onClick={onClick}
      disabled={disabled}
      aria-label={badge ? label : undefined}
      aria-describedby={badge ? id : undefined}
      className="grid content-start justify-items-center gap-2 rounded-[8px] px-1 py-1.5 disabled:opacity-40"
    >
      <span
        className={cn(
          "grid size-14 place-items-center rounded-full [&_svg]:size-[22px] [&_svg]:stroke-[1.75]",
          primary ? "bg-[var(--m-accent)] text-[var(--m-on-accent)]" : "border border-[var(--m-outline)] text-[var(--m-on-surface)]",
        )}
      >
        {icon}
      </span>
      <span className="grid text-center text-[13px] leading-tight font-medium">
        {label}
        {badge && (
          <span id={id} className="mt-0.5 text-[11px] font-medium whitespace-nowrap text-[var(--m-on-surface-variant)]">
            {badge}
          </span>
        )}
      </span>
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
    <nav className="z-10 grid h-[72px] grid-flow-col border-t border-[var(--m-outline-variant)] bg-[var(--m-surface)] max-sm:fixed max-sm:inset-x-0 max-sm:bottom-0 max-sm:z-50 max-sm:h-[calc(72px+env(safe-area-inset-bottom))] max-sm:pb-[env(safe-area-inset-bottom)] sm:sticky sm:-bottom-5 sm:-mb-5 sm:h-[92px] sm:pb-5" aria-label="Navegación">
      {items.map((it) => {
        const on = it.id === value;
        const body = (
          <>
            <span className={cn("[&_svg]:size-6 [&_svg]:stroke-[1.75]", on ? "text-[var(--m-on-surface)]" : "text-[var(--m-on-surface-variant)]")}>{it.icon}</span>
            <span className={cn("text-[12px] tracking-[0.02em]", on ? "font-semibold text-[var(--m-on-surface)]" : "font-medium text-[var(--m-on-surface-variant)]")}>{it.label}</span>
            <span className={cn("size-1 rounded-full transition-opacity duration-200", on ? "opacity-100" : "opacity-0")} style={{ background: "var(--m-accent)" }} />
          </>
        );
        const cls = "m-tap grid content-center justify-items-center gap-1";
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

/** Row hairline, inset to the content margins (as in the editorial phones' BankRow lists). */
export const DIVIDER = "relative after:pointer-events-none after:absolute after:inset-x-4 after:bottom-0 after:h-px after:bg-[var(--m-outline-variant)]";

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
  const cls = cn("flex w-full items-center gap-3.5 px-4", supporting ? "min-h-16 py-2" : "min-h-14 py-1", divider && DIVIDER, className);
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

/**
 * Section header: tiny uppercase meta + optional action ("MOVIMIENTOS · Ver todo") over an ink hairline,
 * like the editorial SectionHead in Crédito/Invest, so all four phones head their sections alike.
 */
export function ListHeader({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="px-4 pt-5">
      <div className="flex min-h-10 items-end justify-between gap-3 border-b border-[var(--m-on-surface)] pb-2">
        <p className="m-meta text-[var(--m-on-surface)]">{children}</p>
        {action}
      </div>
    </div>
  );
}

/** The section header's action link ("Ver todo"), as in the editorial phones. */
export function ListHeaderAction({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="m-tap -my-2 h-10 text-[13px] font-semibold text-[var(--m-on-surface)]">
      {children}
    </button>
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

/**
 * Small precise honesty label ("DEMO", "SIMULADO", "TESTNET · SIN VALOR REAL"). Hidden by the ?present=1
 * capture mode (data-honesty) unless `guardrail` (labels that must always show, e.g. simulated consent).
 */
export function DemoBadge({
  children = "Demo",
  tone = "neutral",
  guardrail,
  className,
}: {
  children?: ReactNode;
  tone?: "neutral" | "accent" | "onAccent";
  guardrail?: boolean;
  className?: string;
}) {
  return (
    <span
      data-honesty={guardrail ? undefined : ""}
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
  return (
    <p data-honesty className={cn("m-meta px-4", className)}>
      {children}
    </p>
  );
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
  // Decided during render (the new screen mounts with the right slide); stable across re-renders.
  const [nav, setNav] = useState<{ screen: T; dir: "fwd" | "back" }>({ screen, dir: "fwd" });
  if (nav.screen !== screen) {
    const dir = order.indexOf(screen) >= order.indexOf(nav.screen) ? "fwd" : "back";
    setNav({ screen, dir });
    return dir;
  }
  return nav.dir;
}

/** Re-mounts its child with a short shared-axis slide whenever `id` changes. */
export function ScreenTransition({ id, dir = "fwd", children, className }: { id: string; dir?: "fwd" | "back" | "fade"; children: ReactNode; className?: string }) {
  return (
    <div key={id} className={cn(dir === "fwd" ? "m-enter-fwd" : dir === "back" ? "m-enter-back" : "m-enter-fade", "flex min-h-full flex-col", className)}>
      {children}
    </div>
  );
}

/**
 * A number that glides to each new `value` (ease-out cubic, 420ms), same motion as @/lib/motion's Ticker:
 * the first known value shows as is (no fake count-up from 0), reduced motion jumps. Undefined until known.
 */
export function useTickUp(value: number | undefined, ms: number = DUR.slow) {
  const reduced = useReducedMotion();
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  useEffect(() => {
    const a = from.current;
    if (value === undefined || a === undefined || reduced || a === value) {
      from.current = value;
      setShown(value);
      return;
    }
    const t0 = performance.now();
    let raf = 0;
    const step = (t: number) => {
      const k = Math.min(1, (t - t0) / ms);
      setShown(a + (value - a) * (1 - Math.pow(1 - k, 3)));
      if (k < 1) raf = requestAnimationFrame(step);
      else from.current = value;
    };
    raf = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(raf);
      from.current = value;
    };
  }, [value, ms, reduced]);
  return shown;
}

/** A formatted number that glides to new values (web's Ticker; "—" until known). */
export function TickUp({ value, format, ms = DUR.slow }: { value: number | undefined; format: (n: number) => string; ms?: number }) {
  return <Ticker value={value} format={format} duration={ms} />;
}

/**
 * The one signature success motion (v5): web's SuccessCheck from @/lib/motion (a check that draws itself in
 * a soft accent ripple), in the app's accent. `color` overrides it (e.g. ink where the accent is too light).
 */
export function SuccessCheck({ size = 88, color, label = "Listo" }: { size?: number; color?: string; label?: string }) {
  const c = color ?? "var(--m-accent)";
  return (
    <span className="inline-grid" style={{ color: c, "--accent": c } as CSSProperties}>
      <MotionCheck size={size} label={label} />
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
export function DetailRows({ rows }: { rows: { label: ReactNode; value: ReactNode; sub?: ReactNode; /** the sub is a disclaimer (?present=1 hides it) */ subHonesty?: boolean }[] }) {
  return (
    <dl className="grid border-t border-[var(--m-outline-variant)]">
      {rows.map((r, i) => (
        <div key={i} className="flex items-start justify-between gap-3 border-b border-[var(--m-outline-variant)] py-3">
          <dt className="m-meta pt-0.5">{r.label}</dt>
          <dd className="min-w-0 text-right">
            <span className="m-num block text-[15px] font-semibold break-words">{r.value}</span>
            {r.sub && (
              <span data-honesty={r.subHonesty ? "" : undefined} className="block text-[13px] text-[var(--m-on-surface-variant)]">
                {r.sub}
              </span>
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}
