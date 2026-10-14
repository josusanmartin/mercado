"use client";
// Editorial pieces for the in-phone apps (crew/PRINCIPLES.md on top of the mobile.md v2 fintech structure):
//   <EdApp> canvas · <Meta> tiny uppercase line · <BigMoney> Archivo Black balance · <Display> titles
//   <ActionRow>/<RoundAction> 56px round actions · <BankRow> + <DayGroups> bank-style lists
//   <Pill> black pill button · <SplitStats> side-by-side figures on hairlines · <DotNav> bottom nav
// Built for Crédito + Invest (mobile2) on the kit's paper theme; generic enough for mobile to promote into the kit.
import { isValidElement, useEffect, useRef, type CSSProperties, type ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { Stagger } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { fmtMoney, haceTiempo, haptic } from "../format";
import { usePresent } from "@/components/console/present";
import { Display as KitDisplay, Pressable } from "../primitives";
import "./editorial.css";

/** Marker class for editorial app roots (fonts + tokens come from the kit's .m-root theme). */
export const edClass = "m-ed";

/** Pass `screen` (any key that changes per screen) to scroll the phone back to the top on navigation. */
export function EdApp({ children, className, style, screen }: { children: ReactNode; className?: string; style?: CSSProperties; screen?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (screen === undefined) return;
    const el = ref.current?.closest(".m-scroll");
    if (el) el.scrollTop = 0;
    // on a real phone the app is the page
    else if (window.matchMedia("(max-width: 639px)").matches) ref.current?.scrollIntoView({ block: "start" });
  }, [screen]);
  return (
    <div ref={ref} className={cn(edClass, "flex min-h-full flex-1 flex-col bg-[var(--m-surface)] text-[var(--m-on-surface)]", className)} style={style}>
      {children}
    </div>
  );
}

/** "■ CRÉDITO · CDMX · 02:58 · TESTNET · SIN VALOR REAL": parts joined with a middle dot. */
export function Meta({ parts, mark, className }: { parts: (ReactNode | false | undefined | null)[]; mark?: string; className?: string }) {
  const items = parts.filter((p) => p !== false && p !== undefined && p !== null && p !== "");
  return (
    <p className={cn("m-meta flex flex-wrap items-center gap-x-1.5", className)}>
      {mark && <span aria-hidden className="inline-block size-[7px]" style={{ background: mark }} />}
      {items.map((p, i) => (
        <span key={i} className={typeof p === "string" && p.length > 30 ? undefined : "whitespace-nowrap"}>
          {p}
          {i < items.length - 1 && <span aria-hidden className="ml-1.5">·</span>}
        </span>
      ))}
    </p>
  );
}

/**
 * v5 color world (crew/PRINCIPLES.md §v5): the top of a screen as a full-bleed accent field. Everything inside is
 * ink (AA: 4.6:1 on rosa, 9.4:1 on maize), so the kit's grey/accent/skeleton tokens are re-pointed to ink here.
 * Pair it with washStyle() on what follows for the soft fade into the white canvas.
 */
export function AccentField({ color, children, className }: { color: string; children: ReactNode; className?: string }) {
  const ink = "#0a0a0a";
  const tokens = { "--m-on-surface": ink, "--m-on-surface-variant": ink, "--m-accent": ink, "--m-on-accent": color, "--m-surface-3": "rgba(10,10,10,.16)" };
  return (
    <div className={cn("text-[#0a0a0a]", className)} style={{ background: color, ...tokens } as CSSProperties}>
      {children}
    </div>
  );
}

/** The ~12% accent wash fading into the canvas over ~120px, for the block right under an AccentField. */
export const washStyle = (color: string): CSSProperties => ({ backgroundImage: `linear-gradient(${color}1f, transparent 120px)`, backgroundRepeat: "no-repeat" });

/** Uppercase Archivo Black statement. `fit` keeps a one-line word inside the column (kit <Display fit>). */
export function Display({ children, size = 40, className, as: Tag = "h2", fit }: { children: ReactNode; size?: number; className?: string; as?: "h1" | "h2" | "p"; fit?: boolean }) {
  if (fit)
    return (
      <KitDisplay fit size={size} as={Tag} className={className}>
        {children}
      </KitDisplay>
    );
  return (
    <Tag className={cn("m-display", className)} style={{ fontSize: size }}>
      {children}
    </Tag>
  );
}

/** The one huge balance: "$1,500" in Archivo Black, ".00" and the unit smaller. */
export function BigMoney({
  value,
  unit,
  size = 52,
  digits = 2,
  prefix = "$",
  className,
}: {
  value: bigint | number | undefined;
  unit?: string;
  size?: number;
  digits?: number;
  prefix?: string;
  className?: string;
}) {
  const s = fmtMoney(value, digits); // "$1,234.56" / "—"
  const neg = s.startsWith("-");
  const body = s.replace(/^-?\$/, "");
  const [int, dec] = body.split(".");
  // Kit <Display fit>: shrinks to the column; decimals and unit are em-relative so they shrink with it.
  return (
    <KitDisplay fit size={size} className={cn("m-tick flex items-baseline", className)} key={s}>
      {s === "—" ? (
        <span className="text-[var(--m-surface-3)]">—</span>
      ) : (
        <>
          <span>
            {neg && "−"}
            {prefix}
            {int}
          </span>
          {dec && <span className="text-[0.46em]">.{dec}</span>}
          {unit && (
            <span className="ml-2 font-[family-name:var(--font-phone)] text-[max(13px,0.28em)] font-semibold tracking-normal normal-case">{unit}</span>
          )}
        </>
      )}
    </KitDisplay>
  );
}

/** Two (or three) figures side by side, split by hairlines, no boxes. */
export function SplitStats({ items }: { items: { label: ReactNode; value: ReactNode; sub?: ReactNode; onClick?: () => void }[] }) {
  return (
    <div className="grid border-y border-[var(--m-on-surface)]" style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0,1fr))` }}>
      {items.map((it, i) => {
        const inner = (
          <>
            <span className="m-meta block">{it.label}</span>
            {/* fit: a half-width column can't hold "MX$1,125.00" at 24px; shrink instead of clipping */}
            <KitDisplay fit as="span" size={24} className="mt-2 block">
              {it.value}
            </KitDisplay>
            {it.sub && <span className="mt-1 block text-[12.5px] text-[var(--m-on-surface-variant)]">{it.sub}</span>}
          </>
        );
        const cls = cn("min-w-0 py-3.5 text-left", i > 0 ? "border-l border-[var(--m-outline-variant)] pl-4" : "pr-4");
        return it.onClick ? (
          <Pressable key={i} className={cls} onClick={it.onClick}>
            {inner}
          </Pressable>
        ) : (
          <div key={i} className={cls}>
            {inner}
          </div>
        );
      })}
    </div>
  );
}

/** A 56px round action with a short label underneath. `primary` fills it with the product accent. */
export function RoundAction({
  icon,
  label,
  onClick,
  href,
  primary,
  disabled,
}: {
  icon: ReactNode;
  label: string;
  onClick?: () => void;
  href?: string;
  primary?: boolean;
  disabled?: boolean;
}) {
  const disc = (
    <span
      className={cn(
        "grid size-14 place-items-center rounded-full [&_svg]:size-[22px]",
        primary ? "bg-[var(--m-accent)] text-[var(--m-on-accent)]" : "border border-[var(--m-on-surface)] text-[var(--m-on-surface)]",
      )}
    >
      {icon}
    </span>
  );
  const text = <span className="text-[12.5px] leading-tight font-medium">{label}</span>;
  const cls = "m-press grid w-[72px] justify-items-center gap-2 rounded-[8px] py-1 disabled:opacity-35";
  if (href)
    return (
      <a href={href} className={cls} onClick={() => haptic()}>
        {disc}
        {text}
      </a>
    );
  return (
    <Pressable className={cls} onClick={onClick} disabled={disabled} centeredRipple>
      {disc}
      {text}
    </Pressable>
  );
}

export function ActionRow({ children }: { children: ReactNode }) {
  return <div className="flex justify-between px-1">{children}</div>;
}

/** Black pill (the kit inverse token: cream in the ink theme), or the product accent with `accent`; 52px. Shows a spinner + label while busy. */
export function Pill({
  children,
  onClick,
  disabled,
  loading,
  accent,
  variant = "solid",
  className,
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  loading?: boolean;
  accent?: boolean;
  variant?: "solid" | "line";
  className?: string;
}) {
  return (
    <Pressable
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "inline-flex h-[52px] w-full items-center justify-center gap-2 rounded-full px-6 text-[16px] font-semibold",
        variant === "solid" && (accent ? "bg-[var(--m-accent)] text-[var(--m-on-accent)]" : "bg-[var(--m-inverse)] text-[var(--m-on-inverse)]"),
        variant === "line" && "border border-[var(--m-on-surface)] text-[var(--m-on-surface)]",
        // busy keeps its color (with a spinner); only a truly unavailable action greys out
        loading ? "cursor-progress" : "disabled:border-transparent disabled:bg-[var(--m-surface-2)] disabled:text-[var(--m-on-surface-variant)]",
        className,
      )}
    >
      {loading && <Loader2 className="size-[18px] animate-spin" />}
      {children}
    </Pressable>
  );
}

/** Small selectable pill (25% · 50% · Todo). */
export function PillChip({ selected, children, onClick, disabled }: { selected?: boolean; children: ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <Pressable
      aria-pressed={selected}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "relative inline-flex h-9 items-center rounded-full px-4 text-[14px] font-medium after:absolute after:inset-x-0 after:-inset-y-1.5 after:content-['']",
        selected ? "bg-[var(--m-inverse)] text-[var(--m-on-inverse)]" : "border border-[var(--m-outline-variant)] text-[var(--m-on-surface)]",
      )}
    >
      {children}
    </Pressable>
  );
}

/** Section heading: tiny meta label on the left, optional action on the right, hairline under. */
export function SectionHead({ children, action, className }: { children: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cn("flex min-h-10 items-end justify-between gap-3 border-b border-[var(--m-on-surface)] pb-2", className)}>
      <p className="m-meta !text-[var(--m-on-surface)]">{children}</p>
      {action}
    </div>
  );
}

/** Bank-style row: round leading mark, title + subtitle, amount right (+jade / −ink). */
export function BankRow({
  leading,
  title,
  sub,
  amount,
  amountSub,
  positive,
  href,
  onClick,
}: {
  leading: ReactNode;
  title: ReactNode;
  sub?: ReactNode;
  amount?: ReactNode;
  amountSub?: ReactNode;
  positive?: boolean;
  href?: string;
  onClick?: () => void;
}) {
  const body = (
    <>
      <span aria-hidden className="grid size-10 shrink-0 place-items-center overflow-hidden rounded-full [&_svg]:size-[18px]">{leading}</span>
      <span className="min-w-0 flex-1 text-left">
        <span className="block truncate text-[15px] leading-5 font-medium">{title}</span>
        {sub && <span className="block truncate text-[13px] leading-5 text-[var(--m-on-surface-variant)]">{sub}</span>}
      </span>
      {(amount || amountSub) && (
        <span className="shrink-0 text-right">
          {amount && <span className={cn("m-num block text-[15px] leading-5 font-semibold", positive && "text-[var(--m-jade)]")}>{amount}</span>}
          {amountSub && <span className="block text-[12px] leading-5 text-[var(--m-on-surface-variant)]">{amountSub}</span>}
        </span>
      )}
    </>
  );
  const cls = "flex min-h-16 w-full items-center gap-3 border-b border-[var(--m-outline-variant)] py-2";
  if (href)
    return (
      <a href={href} target="_blank" rel="noreferrer" className={cn("m-press", cls)}>
        {body}
      </a>
    );
  if (onClick)
    return (
      <Pressable className={cls} onClick={onClick}>
        {body}
      </Pressable>
    );
  return <div className={cls}>{body}</div>;
}

/** "Hoy" / "Ayer" / "12 oct" for a unix-seconds timestamp, relative to `now` (CDMX calendar days). */
export function dayLabel(ts: number | undefined, now: number | undefined): string {
  if (ts === undefined || now === undefined) return "Recientes";
  const day = (s: number) => new Date(s * 1000).toLocaleDateString("en-CA", { timeZone: "America/Mexico_City" });
  const d = day(ts);
  if (d === day(now)) return "Hoy";
  if (d === day(now - 86_400)) return "Ayer";
  return new Date(ts * 1000).toLocaleDateString("es-MX", { day: "numeric", month: "short", timeZone: "America/Mexico_City" });
}

/** Time of day in CDMX, "14:05". */
export function hora(ts: number | undefined): string {
  if (ts === undefined) return "";
  return new Date(ts * 1000).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "America/Mexico_City" });
}

/** Groups newest-first items under Hoy / Ayer / date headers; rows fade up in a stagger on first view (v5). */
export function DayGroups<T>({ items, ts, now, render }: { items: T[]; ts: (t: T) => number | undefined; now: number | undefined; render: (t: T) => ReactNode }) {
  const groups: { label: string; items: T[] }[] = [];
  for (const it of items) {
    const label = dayLabel(ts(it), now);
    const g = groups.at(-1);
    if (g && g.label === label) g.items.push(it);
    else groups.push({ label, items: [it] });
  }
  return (
    <div className="grid grid-cols-[minmax(0,1fr)]">
      {groups.map((g) => (
        <section key={g.label}>
          <p className="m-meta pt-4 pb-1">{g.label}</p>
          <Stagger>
            {g.items.map((it, i) => {
              const row = render(it);
              return <div key={isValidElement(row) && row.key !== null ? row.key : i}>{row}</div>;
            })}
          </Stagger>
        </section>
      ))}
    </div>
  );
}

export type DotNavItem<T extends string> = { id: T; label: string; icon: ReactNode };

/** Bottom nav: 4 line icons with labels, a small accent dot under the active one, hairline on top. */
export function DotNav<T extends string>({ items, value, onChange }: { items: DotNavItem<T>[]; value: T; onChange: (id: T) => void }) {
  return (
    <nav
      aria-label="Navegación"
      className="z-10 grid h-[68px] grid-flow-col border-t border-[var(--m-on-surface)] bg-[var(--m-surface)] max-sm:fixed max-sm:inset-x-0 max-sm:bottom-0 max-sm:z-50 max-sm:h-[calc(68px+env(safe-area-inset-bottom))] max-sm:pb-[env(safe-area-inset-bottom)] sm:sticky sm:-bottom-5 sm:-mb-5 sm:h-[88px] sm:pb-5"
    >
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
            className={cn("grid content-center justify-items-center gap-1 [&_svg]:size-[22px]", on ? "text-[var(--m-on-surface)]" : "text-[var(--m-on-surface-variant)]")}
          >
            {it.icon}
            <span className={cn("text-[11.5px] tracking-[0.02em]", on ? "font-semibold" : "font-medium")}>{it.label}</span>
            <span aria-hidden className={cn("size-1 rounded-full", on ? "bg-[var(--m-accent)]" : "bg-transparent")} />
          </button>
        );
      })}
    </nav>
  );
}

/** Tiny flat flags (no emoji: headless/desktop Linux has no emoji font). Simplified, no coat of arms. */
export function Flag({ code, className }: { code: "mx" | "us"; className?: string }) {
  return code === "mx" ? (
    <svg viewBox="0 0 15 10" className={cn("inline-block h-[10px] w-[15px] align-[-1px]", className)} aria-label="México" role="img">
      <rect width="5" height="10" fill="#006847" />
      <rect x="5" width="5" height="10" fill="#fff" />
      <rect x="10" width="5" height="10" fill="#ce1126" />
      <circle cx="7.5" cy="5" r="1.2" fill="#8c6b2f" />
      <rect width="15" height="10" fill="none" stroke="#0a0a0a" strokeOpacity="0.15" strokeWidth="0.6" />
    </svg>
  ) : (
    <svg viewBox="0 0 15 10" className={cn("inline-block h-[10px] w-[15px] align-[-1px]", className)} aria-label="Estados Unidos" role="img">
      <rect width="15" height="10" fill="#fff" />
      {[0, 2, 4, 6, 8, 10, 12].map((i) => (
        <rect key={i} y={(i * 10) / 13} width="15" height={10 / 13} fill="#b22234" />
      ))}
      <rect width="6.5" height={70 / 13} fill="#3c3b6e" />
      <rect width="15" height="10" fill="none" stroke="#0a0a0a" strokeOpacity="0.15" strokeWidth="0.6" />
    </svg>
  );
}

/** Capture mode (?present=1, deck screenshots only): H("Testnet") → undefined so joined meta parts drop it cleanly.
 *  Without the flag every label renders exactly as before. */
export function useH() {
  const present = usePresent();
  return <T,>(x: T): T | undefined => (present ? undefined : x);
}

/** A list that couldn't load at all: say so and offer a retry (never an endless skeleton). */
export function LoadError({ text = "No pudimos cargar tus movimientos.", onRetry, busy }: { text?: string; onRetry: () => void; busy?: boolean }) {
  return (
    <div role="alert" className="grid justify-items-start gap-2 py-5">
      <p className="text-[14px] text-[var(--m-on-surface-variant)]">{text}</p>
      <button type="button" onClick={onRetry} disabled={busy} className="text-[14px] font-semibold underline underline-offset-4 disabled:opacity-40">
        {busy ? "Reintentando…" : "Reintentar"}
      </button>
    </div>
  );
}

/** Last good data is still on screen but the latest refresh failed: show its age + a retry. */
export function StaleLine({ updatedAt, now, onRetry }: { updatedAt: number; now: number | undefined; onRetry: () => void }) {
  return (
    <p role="status" className="m-meta flex flex-wrap items-center gap-x-1.5 pt-3">
      <span>Sin conexión · actualizado {now ? haceTiempo(updatedAt / 1000, now) : "antes"}</span>
      <span aria-hidden>·</span>
      <button type="button" onClick={onRetry} className="font-semibold underline underline-offset-2">
        Reintentar
      </button>
    </p>
  );
}
