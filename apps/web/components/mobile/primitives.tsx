"use client";
// Material 3-inspired building blocks for the in-phone apps. All live under .m-root (AndroidDevice),
// read --m-accent, use 48dp touch targets and 120–250ms motion.
import {
  forwardRef,
  useEffect,
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

/* ───────────────────────── buttons ───────────────────────── */

type Variant = "filled" | "tonal" | "outlined" | "text" | "dark";
const VARIANT: Record<Variant, string> = {
  filled: "bg-[var(--m-accent)] text-[var(--m-on-accent)] disabled:bg-[#1d1b20]/[0.12] disabled:text-[#1d1b20]/40",
  dark: "bg-[#15171b] text-white disabled:bg-[#1d1b20]/[0.12] disabled:text-[#1d1b20]/40",
  tonal: "bg-[var(--m-accent-container)] text-[var(--m-on-accent-container)] disabled:bg-[#1d1b20]/[0.12] disabled:text-[#1d1b20]/40",
  outlined: "border border-[var(--m-outline)] text-[var(--m-on-surface)] disabled:text-[#1d1b20]/40 disabled:border-[#1d1b20]/12",
  text: "text-[var(--m-on-accent-container)] disabled:text-[#1d1b20]/40",
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
        "inline-flex items-center justify-center gap-2 rounded-full font-medium tracking-[0.01em]",
        size === "lg" ? "h-[52px] px-6 text-[16px]" : "h-10 px-5 text-[14px]",
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

/** Extended FAB (M3): 56dp, 16dp radius, accent container. */
export function Fab({ icon, children, className, ...rest }: PressProps & { icon: ReactNode }) {
  return (
    <Pressable
      className={cn(
        "inline-flex h-14 items-center gap-3 rounded-[16px] bg-[var(--m-accent-container)] px-5 text-[15px] font-medium text-[var(--m-on-accent-container)] shadow-[0_3px_6px_rgb(0_0_0/0.12),0_1px_2px_rgb(0_0_0/0.1)]",
        className,
      )}
      {...rest}
    >
      {icon}
      {children}
    </Pressable>
  );
}

/* ───────────────────────── app bar / nav ───────────────────────── */

/** M3 small top app bar: 64dp, back arrow, title (+ optional English sub-label), actions. */
export function TopAppBar({
  title,
  sub,
  onBack,
  actions,
  className,
  style,
}: {
  title: ReactNode;
  sub?: ReactNode;
  onBack?: () => void;
  actions?: ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <header className={cn("sticky top-0 z-10 flex min-h-16 items-center gap-1 bg-[var(--m-surface)] px-1", !onBack && "pl-4", className)} style={style}>
      {onBack && (
        <IconButton label="Atrás · Back" onClick={onBack}>
          <ArrowLeft className="size-6" strokeWidth={2} />
        </IconButton>
      )}
      <div className="min-w-0 flex-1">
        <h2 className="truncate text-[20px] leading-tight font-normal tracking-normal">{title}</h2>
        {sub && <p className="truncate text-[13px] text-[var(--m-on-surface-variant)]">{sub}</p>}
      </div>
      {actions && <div className="flex items-center">{actions}</div>}
    </header>
  );
}

export type NavItem<T extends string> = { id: T; label: string; icon: ReactNode };

/** M3 navigation bar: 80dp, pill indicator behind the active icon. */
export function BottomNav<T extends string>({ items, value, onChange }: { items: NavItem<T>[]; value: T; onChange: (id: T) => void }) {
  return (
    <nav className="relative z-10 grid h-20 sm:sticky sm:bottom-0 grid-flow-col bg-[var(--m-surface-2)] pb-1 sm:-mb-5 sm:h-[100px] sm:pb-5" aria-label="Navegación">
      {items.map((it) => {
        const on = it.id === value;
        return (
          <button
            key={it.id}
            type="button"
            aria-current={on ? "page" : undefined}
            onClick={() => {
              haptic();
              onChange(it.id);
            }}
            className="group grid content-center justify-items-center gap-1"
          >
            <span
              className={cn(
                "grid h-8 w-16 place-items-center rounded-full transition-colors duration-200 [&_svg]:size-6",
                on ? "bg-[var(--m-accent-container)] text-[var(--m-on-accent-container)]" : "text-[var(--m-on-surface-variant)] group-hover:bg-black/5",
              )}
            >
              {it.icon}
            </span>
            <span className={cn("text-[13px] tracking-[0.02em]", on ? "font-semibold text-[var(--m-on-surface)]" : "font-medium text-[var(--m-on-surface-variant)]")}>{it.label}</span>
          </button>
        );
      })}
    </nav>
  );
}

/* ───────────────────────── lists, avatars, chips ───────────────────────── */

const AVATAR_TONES = ["#ffdcc2", "#d9e2ff", "#ffd8e4", "#c9f0e0", "#ece0ff", "#fff0b3"];
const AVATAR_INK = ["#6e3900", "#1a3a8f", "#8a1748", "#0b5a43", "#4a2d99", "#6b5200"];

/** Initials avatar with a stable soft color per name. */
export function Avatar({ name, size = 40, className, children }: { name: string; size?: number; className?: string; children?: ReactNode }) {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const i = h % AVATAR_TONES.length;
  return (
    <span
      aria-hidden
      className={cn("grid shrink-0 place-items-center rounded-full font-medium", className)}
      style={{ width: size, height: size, background: AVATAR_TONES[i], color: AVATAR_INK[i], fontSize: size * 0.4 }}
    >
      {children ?? initials(name)}
    </span>
  );
}

/** M3 list item: 56dp (one line) or 72dp (two lines). Pass onClick (or href) to make it pressable. */
export function ListItem({
  leading,
  headline,
  supporting,
  trailing,
  trailingSub,
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
        <span className="block truncate text-[16px] leading-6">{headline}</span>
        {supporting && <span className="block truncate text-[14px] leading-5 text-[var(--m-on-surface-variant)]">{supporting}</span>}
      </span>
      {(trailing || trailingSub) && (
        <span className="shrink-0 text-right">
          {trailing && <span className="m-num block text-[15px] leading-6 font-medium">{trailing}</span>}
          {trailingSub && <span className="block text-[13px] leading-5 text-[var(--m-on-surface-variant)]">{trailingSub}</span>}
        </span>
      )}
    </>
  );
  const cls = cn(
    "flex w-full items-center gap-4 px-4",
    supporting ? "min-h-[72px] py-2" : "min-h-14 py-1",
    divider && "border-b border-[var(--m-outline-variant)]",
    className,
  );
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

/** Section header above a list ("Movimientos · Activity"). */
export function ListHeader({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex min-h-12 items-center justify-between px-4 pt-2">
      <p className="text-[14px] font-medium tracking-[0.01em] text-[var(--m-on-surface-variant)]">{children}</p>
      {action}
    </div>
  );
}

/** M3 filter chip: 32dp visual, 48dp hit area. */
export function Chip({
  selected,
  children,
  icon,
  className,
  ...rest
}: PressProps & { selected?: boolean; icon?: ReactNode }) {
  return (
    <Pressable
      aria-pressed={selected}
      className={cn(
        "relative inline-flex h-9 items-center gap-1.5 rounded-[8px] px-3.5 text-[14px] font-medium",
        "after:absolute after:inset-x-0 after:-inset-y-1.5 after:content-['']",
        selected
          ? "bg-[var(--m-accent-container)] text-[var(--m-on-accent-container)]"
          : "border border-[var(--m-outline)] text-[var(--m-on-surface-variant)]",
        className,
      )}
      {...rest}
    >
      {selected ? <Check className="size-[18px]" strokeWidth={2.25} /> : icon}
      {children}
    </Pressable>
  );
}

/* ───────────────────────── status, honesty, feedback ───────────────────────── */

/** Small neutral honesty badge ("Demo", "SIMULATED", "demo token"). */
export function DemoBadge({ children = "Demo", tone = "neutral", className }: { children?: ReactNode; tone?: "neutral" | "accent" | "onAccent"; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-6 shrink-0 items-center rounded-[6px] px-2 text-[12.5px] font-medium tracking-[0.02em]",
        tone === "neutral" && "bg-[var(--m-surface-3)] text-[var(--m-on-surface-variant)]",
        tone === "accent" && "bg-[var(--m-accent-container)] text-[var(--m-on-accent-container)]",
        tone === "onAccent" && "bg-white/20 text-current",
        className,
      )}
    >
      {children}
    </span>
  );
}

/** The quiet honesty line on money screens. */
export function HonestyNote({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn("px-4 text-[13px] leading-[1.4] text-[var(--m-on-surface-variant)]", className)}>{children}</p>;
}

/** Inline error / info banner. */
export function Banner({ tone = "info", icon, children, action }: { tone?: "info" | "error" | "success"; icon?: ReactNode; children: ReactNode; action?: ReactNode }) {
  return (
    <div
      role={tone === "error" ? "alert" : undefined}
      className={cn(
        "flex items-start gap-3 rounded-[16px] p-3.5 text-[14px] leading-[1.4]",
        tone === "info" && "bg-[var(--m-surface-2)] text-[var(--m-on-surface)]",
        tone === "error" && "bg-[#fde7e6] text-[#7a1712]",
        tone === "success" && "bg-[#dff3ea] text-[#0b4d37]",
      )}
    >
      {icon && <span className="mt-px shrink-0 [&_svg]:size-5">{icon}</span>}
      <div className="min-w-0 flex-1">{children}</div>
      {action}
    </div>
  );
}

export function Skeleton({ className, style }: { className?: string; style?: CSSProperties }) {
  return <span aria-hidden className={cn("m-skeleton block rounded-[8px]", className)} style={style} />;
}

/** A list of skeleton rows while data loads. */
export function SkeletonList({ rows = 3 }: { rows?: number }) {
  return (
    <div className="grid" aria-busy="true" aria-label="Cargando · Loading">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex min-h-[72px] items-center gap-4 px-4">
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

/** M3 linear indeterminate progress (top of a busy screen). */
export function LinearProgress({ className }: { className?: string }) {
  return <div role="progressbar" aria-label="Procesando" className={cn("m-progress h-1 w-full rounded-full", className)} />;
}

/** Empty state: icon, title, hint, optional action. */
export function EmptyState({ icon, title, hint, action }: { icon: ReactNode; title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="grid justify-items-center gap-2 px-8 py-8 text-center">
      <span className="grid size-14 place-items-center rounded-full bg-[var(--m-surface-2)] text-[var(--m-on-surface-variant)] [&_svg]:size-6">{icon}</span>
      <p className="text-[16px] font-medium">{title}</p>
      {hint && <p className="text-[14px] text-[var(--m-on-surface-variant)]">{hint}</p>}
      {action}
    </div>
  );
}

/* ───────────────────────── switch ───────────────────────── */

/** M3 switch: 52×32 track, thumb grows with a check when on. 48dp hit area. */
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
          checked ? "border-[var(--m-accent)] bg-[var(--m-accent)]" : "border-[var(--m-outline)] bg-[var(--m-surface-3)]",
        )}
      >
        <span
          className={cn(
            "absolute top-1/2 grid -translate-y-1/2 place-items-center rounded-full transition-all duration-200 ease-[cubic-bezier(0.2,0,0,1)]",
            checked ? "left-[22px] size-6 bg-white text-[var(--m-accent)]" : "left-[4px] size-4 bg-[var(--m-outline)] group-active:size-[22px]",
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

/** Re-mounts its child with a shared-axis slide whenever `id` changes. */
export function ScreenTransition({ id, dir = "fwd", children, className }: { id: string; dir?: "fwd" | "back" | "fade"; children: ReactNode; className?: string }) {
  return (
    <div key={id} className={cn(dir === "fwd" ? "m-enter-fwd" : dir === "back" ? "m-enter-back" : "m-enter-fade", "flex min-h-full flex-col", className)}>
      {children}
    </div>
  );
}

/** The success disc: pops in, draws the tick, sends out one soft ring. */
export function SuccessCheck({ size = 88, color }: { size?: number; color?: string }) {
  const c = color ?? "var(--m-accent)";
  return (
    <span className="relative grid place-items-center" style={{ width: size, height: size }} role="img" aria-label="Listo · Done">
      <span className="m-check-ring absolute inset-0 rounded-full" style={{ background: c }} />
      <span className="m-check-disc absolute inset-0 rounded-full" style={{ background: c }} />
      <svg viewBox="0 0 24 24" className="relative" style={{ width: size * 0.5, height: size * 0.5 }} fill="none" stroke="white" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round">
        <path className="m-check-tick" d="M5 12.5l4.5 4.5L19 7.5" />
      </svg>
    </span>
  );
}

/** Full-screen success layout: check, title, big amount, details, primary action pinned low. */
export function SuccessScreen({
  title,
  amount,
  caption,
  children,
  action,
}: {
  title: ReactNode;
  amount?: ReactNode;
  caption?: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex min-h-full flex-col items-center px-6 pt-12 pb-6 text-center">
      <SuccessCheck />
      <p className="m-rise mt-6 text-[22px] leading-tight" style={{ animationDelay: "250ms" }}>
        {title}
      </p>
      {amount && (
        <p className="m-rise m-num mt-2 text-[40px] leading-none font-medium tracking-tight" style={{ animationDelay: "320ms" }}>
          {amount}
        </p>
      )}
      {caption && (
        <p className="m-rise mt-2 text-[14px] text-[var(--m-on-surface-variant)]" style={{ animationDelay: "380ms" }}>
          {caption}
        </p>
      )}
      {children && (
        <div className="m-rise mt-6 w-full text-left" style={{ animationDelay: "440ms" }}>
          {children}
        </div>
      )}
      {action && <div className="mt-auto w-full pt-6">{action}</div>}
    </div>
  );
}

/** Label/value rows used on receipts. */
export function DetailRows({ rows }: { rows: { label: ReactNode; value: ReactNode; sub?: ReactNode }[] }) {
  return (
    <dl className="grid rounded-[16px] bg-[var(--m-surface-1)] px-4 py-1">
      {rows.map((r, i) => (
        <div key={i} className={cn("flex items-start justify-between gap-3 py-3", i > 0 && "border-t border-[var(--m-outline-variant)]")}>
          <dt className="text-[14px] text-[var(--m-on-surface-variant)]">{r.label}</dt>
          <dd className="min-w-0 text-right">
            <span className="m-num block text-[14px] font-medium break-words">{r.value}</span>
            {r.sub && <span className="block text-[13px] text-[var(--m-on-surface-variant)]">{r.sub}</span>}
          </dd>
        </div>
      ))}
    </dl>
  );
}
