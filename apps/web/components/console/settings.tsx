"use client";
// Product page building blocks (crew/DESIGN-ECOSYSTEM.md). APIs are unchanged from the console
// version so existing screens re-skin automatically:
//   <SettingsLayout title list={<ListPane …/>} [product purpose kpis demo]>  → hero band + tabs + content
//   <Panel title description aside>  <Rows><Row label value sub/></Rows>  <BigNumber/>  <PanelActions/>
// The product (and its signature color) comes from the route unless `product` is passed.
import type { CSSProperties, ReactNode } from "react";
import { usePathname } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import { useConnection } from "wagmi";
import { explorerAddress } from "@mercado/shared";
import { shortAddr } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { PersonaId } from "@/components/wallet/personas";
import { PRODUCTS, productForPath, type ProductId } from "./products";
import { useDemoAccount } from "./demo-mode";
import { LiveMeta, Meta } from "./meta";
import { LetterReveal, TickerText } from "@/lib/motion";

export type Kpi = { label: string; value: ReactNode; sub?: ReactNode };

export function SettingsLayout({
  title,
  list,
  children,
  product,
  purpose,
  demo,
  statement,
  meta,
  heroVariant,
}: {
  title: string;
  list?: ReactNode;
  children: ReactNode;
  product?: ProductId;
  purpose?: ReactNode;
  /** @deprecated Not rendered (josu, 03:02: the KPI strip is gone). Kept so existing callers compile. */
  kpis?: Kpi[];
  /** Demo-mode account for this page/tab; defaults to the product's. */
  demo?: PersonaId | null;
  /** Giant display statement instead of the product name, e.g. "Crea pesos." */
  statement?: ReactNode;
  /** Tiny uppercase line replacing the default live meta (CDMX · rate · time · testnet). */
  meta?: ReactNode;
  /** V5-TASTE #2: "utility" (Developers, Contracts) is a compact, complete header; "product" is the color band. */
  heroVariant?: "product" | "utility";
}) {
  const path = usePathname();
  const p = product ? PRODUCTS.find((x) => x.id === product)! : productForPath(path);
  // Developers and Contracts default to the compact utility header (V5-TASTE #2); everything else is a product band.
  const variant = heroVariant ?? (path.startsWith("/developers") || path.startsWith("/contracts") ? "utility" : "product");
  return (
    // V5-TASTE #4: tighter section rhythm on phones; utility pages get 24px to their tabs (#2).
    <div className={cn("grid", variant === "utility" ? "gap-6" : "gap-6 sm:gap-10")}>
      <ProductHero
        product={p.id}
        title={title}
        purpose={purpose ?? p.purpose}
        demo={demo === null ? undefined : (demo ?? p.demo)}
        statement={statement}
        meta={meta}
        variant={variant}
      />
      {list}
      <div className="min-w-0">{children}</div>
    </div>
  );
}

/**
 * Editorial product header (PRINCIPLES): a tiny meta row (index · product · live CDMX/rate/time ·
 * testnet), the product name set huge in the display face, one plain purpose line, then up to three
 * big unboxed KPIs separated by hairlines.
 */
export function ProductHero({
  product,
  title,
  purpose,
  demo,
  statement,
  meta,
  variant = "product",
}: {
  product: ProductId;
  title?: string;
  purpose?: ReactNode;
  kpis?: Kpi[];
  demo?: PersonaId;
  statement?: ReactNode;
  meta?: ReactNode;
  variant?: "product" | "utility";
}) {
  const p = PRODUCTS.find((x) => x.id === product)!;
  const persona = useDemoAccount(demo);
  const { address } = useConnection();
  const utility = variant === "utility"; // V5-TASTE #2: Developers/Contracts get a compact, complete header
  const world = p.id !== "home" && !utility; // v5 color field on product pages only
  const word = statement ?? (p.id === "home" ? (title ?? p.name) : p.short);
  // V5-TASTE #3: letters reveal only for the short product word; statements and utility titles read at once.
  const lettered = !utility && typeof word === "string" && !/\s/.test(word) && word.length <= 12;
  return (
    // Size container: the statement is fit to the content column, not the viewport (which includes the
    // sidebar). CR-04: capped at 72–80px and the whole block kept ≤170px of the 1440x900 fold.
    // v5 color world: on product pages the meta row + statement sit on a full-bleed field of the product's
    // accent (--hero-bg/--hero-fg: AA for small text on every fill, both themes); the purpose sits on the wash.
    <section data-phone-hide className="grid min-w-0 gap-3 [container-type:inline-size]">
      <div
        className={cn(
          "grid gap-2",
          world && "-mx-4 -mt-5 bg-[var(--hero-bg)] px-4 pt-4 pb-5 text-[var(--hero-fg)] transition-colors duration-300 sm:-mx-8 sm:-mt-8 sm:px-8",
        )}
      >
        <div className={cn("flex flex-wrap items-center justify-between gap-x-6 gap-y-1 border-b pb-2", world && "border-current/25")}>
          <Meta className={cn(world && "text-current")}>
            <span className="mr-1.5 inline-block size-2 align-baseline" style={{ background: world ? "currentColor" : p.id === "home" ? "var(--ink)" : p.color }} aria-hidden />
            {p.index} · {p.id === "home" ? "Mercado" : p.name}
          </Meta>
          {meta ? <Meta className={cn(world && "text-current")}>{meta}</Meta> : <LiveMeta className={cn(world && "text-current")} />}
        </div>
        {/* CR-04: the demo account sits on the title row, so it never costs a line of its own. */}
        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-1">
          <h1
            className={cn(
              "display break-words",
              utility ? "text-[clamp(2rem,4vw,3rem)]" : world ? "text-[clamp(2.2rem,12.5cqw,4.5rem)]" : "text-product text-[clamp(2.2rem,12.5cqw,5rem)]",
            )}
            style={utility || (!world && (p.id === "home" || p.id === "invest")) ? { color: "var(--ink)" } : undefined /* R-050: maize on white is 2.1:1 */}
          >
            {lettered ? <LetterReveal text={word as string} /> : word}
          </h1>
          {/* Utility pages: the account already shows in the wallet control, so no second account line (#2). */}
          {persona && !utility && (
            <a href={address ? explorerAddress(address) : undefined} target="_blank" rel="noreferrer" className={cn("meta pb-2", world ? "text-current hover:underline" : "text-muted-foreground hover:text-foreground")} title="Testnet demo key, no real value">
              Demo account · <span className={cn(!world && "text-foreground")}>{persona.name}</span>
              {address && persona.address?.toLowerCase() === address.toLowerCase() && <> · {shortAddr(address)}</>}
            </a>
          )}
        </div>
        {/* lead 05:15: the purpose sits inside the band (on-accent text), so the color world is one block.
            V5-TASTE #2: never clamped (no sentence ends in "…"); owners keep it to one short sentence. */}
        {(purpose ?? p.purpose) && (
          <p className={cn("max-w-5xl text-base leading-snug text-pretty", !utility && "sm:text-lg", world && "text-current")}>{purpose ?? p.purpose}</p>
        )}
      </div>
      {/* josu (03:02): no KPI strip under product headers. `kpis` is still accepted but not rendered;
          numbers belong where the user acts (quote, draw sheet, Risk tab). */}
    </section>
  );
}

export type ListItemDef = { id: string; label: string; icon?: LucideIcon; hint?: ReactNode };

/** Section tabs under the hero (scrolls horizontally on phones). */
export function ListPane({ items, value, onChange, label }: { items: ListItemDef[]; value: string; onChange: (id: string) => void; label: string }) {
  return (
    <nav aria-label={label} role="tablist" className="scrollbar-none -mx-4 flex gap-6 overflow-x-auto border-b px-4 sm:mx-0 sm:px-0">
      {items.map((it) => {
        const on = it.id === value;
        const Icon = it.icon;
        return (
          <button
            key={it.id}
            type="button"
            role="tab"
            aria-selected={on}
            aria-current={on ? "true" : undefined}
            onClick={() => onChange(it.id)}
            className={cn(
              "meta -mb-px flex shrink-0 items-center gap-2 border-b-2 py-3 transition-colors duration-150",
              on ? "border-foreground text-foreground" : "text-muted-foreground hover:text-foreground border-transparent",
            )}
          >
            {Icon && <Icon className="size-4" strokeWidth={1.75} aria-hidden />}
            {it.label}
            {it.hint && <span className="text-muted-foreground tabular">{it.hint}</span>}
          </button>
        );
      })}
    </nav>
  );
}

/**
 * A titled section. Brand v4: unboxed by default (whitespace + hairlines); `variant="card"` only
 * for the one thing you act on (the action column).
 */
export function Panel({
  title,
  description,
  aside,
  children,
  className,
  variant = "plain",
  style,
  animate = false,
}: {
  title?: ReactNode;
  description?: ReactNode;
  aside?: ReactNode;
  children: ReactNode;
  className?: string;
  variant?: "plain" | "card";
  style?: CSSProperties;
  /** V5-TASTE #3: off by default; the page's route group is the one entrance owner. Opt in only for a panel
   *  that arrives on its own after the page (pure CSS, ends visible). */
  animate?: boolean;
}) {
  const card = variant === "card";
  return (
    <section style={style} className={cn(animate && "mx-reveal", card ? "bg-well rounded-[8px]" : "border-t pt-4", className)}>
      {(title || aside) && (
        <header className={cn("flex flex-wrap items-start justify-between gap-3", card && "px-5 pt-5 sm:px-6")}>
          <div className="min-w-0">
            {title && <h2 className="text-2xl font-semibold tracking-tight">{title}</h2>}
            {description && <p className="text-muted-foreground mt-1 max-w-prose text-[15px] text-pretty">{description}</p>}
          </div>
          {aside}
        </header>
      )}
      <div className={cn("pt-3", card && "px-5 pb-5 sm:px-6 sm:pb-6")}>{children}</div>
    </section>
  );
}

/** Plain row: label left, value right, 1px divider. */
export function Row({ label, value, sub, className }: { label: ReactNode; value: ReactNode; sub?: ReactNode; className?: string }) {
  return (
    <div className={cn("flex min-h-13 items-center justify-between gap-4 border-b py-2.5 last:border-b-0", className)}>
      <div className="min-w-0">
        <div className="text-[15px]">{label}</div>
        {sub && <div className="text-muted-foreground text-[13px]">{sub}</div>}
      </div>
      <div className="text-right text-[15px] font-semibold tabular">{value}</div>
    </div>
  );
}

export function Rows({ children, className, ...rest }: React.ComponentProps<"div">) {
  return (
    <div className={cn("grid", className)} {...rest}>
      {children}
    </div>
  );
}

/** The one figure that matters in a panel, in the product's color. */
export function BigNumber({ value, unit, className }: { value: ReactNode; unit?: ReactNode; className?: string }) {
  return (
    <p className={cn("display text-[clamp(2.6rem,5vw,4rem)] tabular", className)}>
      {/* v5: a formatted number glides to each new value (quotes, coverage); anything else renders as is. */}
      {typeof value === "string" ? <TickerText text={value} /> : value}
      {unit && <span className="text-muted-foreground ml-2 font-sans text-lg font-medium tracking-normal normal-case">{unit}</span>}
    </p>
  );
}

export function PanelActions({ children }: { children: ReactNode }) {
  return <div className="mt-6 grid gap-3 sm:flex sm:flex-wrap [&>*]:sm:min-w-48">{children}</div>;
}

/** "■ 01 · COLATERAL"-style section label (tiny uppercase meta with an index). */
export function SectionLabel({ index, children, className }: { index?: string; children: ReactNode; className?: string }) {
  return (
    <Meta className={className}>
      <span className="bg-product mr-1.5 inline-block size-2 align-baseline" aria-hidden />
      {index && <>{index} · </>}
      {children}
    </Meta>
  );
}
