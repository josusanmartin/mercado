"use client";
// Product page building blocks (crew/DESIGN-ECOSYSTEM.md). APIs are unchanged from the console
// version so existing screens re-skin automatically:
//   <SettingsLayout title list={<ListPane …/>} [product purpose kpis demo]>  → hero band + tabs + content
//   <Panel title description aside>  <Rows><Row label value sub/></Rows>  <BigNumber/>  <PanelActions/>
// The product (and its signature color) comes from the route unless `product` is passed.
import type { ReactNode } from "react";
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
}) {
  const path = usePathname();
  const p = product ? PRODUCTS.find((x) => x.id === product)! : productForPath(path);
  return (
    <div className="grid gap-10">
      <ProductHero
        product={p.id}
        title={title}
        purpose={purpose ?? p.purpose}
        demo={demo === null ? undefined : (demo ?? p.demo)}
        statement={statement}
        meta={meta}
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
}: {
  product: ProductId;
  title?: string;
  purpose?: ReactNode;
  kpis?: Kpi[];
  demo?: PersonaId;
  statement?: ReactNode;
  meta?: ReactNode;
}) {
  const p = PRODUCTS.find((x) => x.id === product)!;
  const persona = useDemoAccount(demo);
  const { address } = useConnection();
  return (
    // Size container: the statement is fit to the content column, not the viewport (which includes the
    // sidebar). 12.5cqw keeps an 11-letter word ("VERIFICADO.", ~7.7em in Archivo Black) whole.
    // CR-04: capped at 80px and the whole block kept ≤170px at 1440x900, so the product's phone and primary
    // action fit in the first screen (the giant title made products non-actionable above the fold).
    <section data-phone-hide className="grid min-w-0 gap-3 [container-type:inline-size]">
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-1 border-b pb-3">
        <Meta>
          <span className="mr-1.5 inline-block size-2 align-baseline" style={{ background: p.id === "home" ? "var(--ink)" : p.color }} aria-hidden />
          {p.index} · {p.id === "home" ? "Mercado" : p.name}
        </Meta>
        {meta ? <Meta>{meta}</Meta> : <LiveMeta />}
      </div>
      <div className="grid gap-2">
        {/* CR-04: the demo account sits on the title row, so it never costs a line of its own. */}
        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-1">
          <h1 className="display text-product text-[clamp(2.2rem,12.5cqw,5rem)] break-words" style={p.id === "home" || p.id === "invest" ? { color: "var(--ink)" } : undefined /* R-050: maize on white is 2.1:1, so Invest's statement is ink */}>
            {statement ?? (p.id === "home" ? (title ?? p.name) : p.short)}
          </h1>
          {persona && (
            <a href={address ? explorerAddress(address) : undefined} target="_blank" rel="noreferrer" className="meta text-muted-foreground hover:text-foreground pb-2" title="Testnet demo key, no real value">
              Demo account · <span className="text-foreground">{persona.name}</span>
              {address && persona.address?.toLowerCase() === address.toLowerCase() && <> · {shortAddr(address)}</>}
            </a>
          )}
        </div>
        {(purpose ?? p.purpose) && <p className="line-clamp-2 max-w-5xl text-base leading-snug text-pretty sm:text-lg">{purpose ?? p.purpose}</p>}
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
}: {
  title?: ReactNode;
  description?: ReactNode;
  aside?: ReactNode;
  children: ReactNode;
  className?: string;
  variant?: "plain" | "card";
}) {
  const card = variant === "card";
  return (
    <section className={cn("animate-in fade-in-0 duration-150", card ? "bg-well rounded-[8px]" : "border-t pt-4", className)}>
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
      {value}
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
