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

export type Kpi = { label: string; value: ReactNode; sub?: ReactNode };

export function SettingsLayout({
  title,
  list,
  children,
  product,
  purpose,
  kpis,
  demo,
}: {
  title: string;
  list?: ReactNode;
  children: ReactNode;
  product?: ProductId;
  purpose?: ReactNode;
  /** Up to three live numbers for the hero band. Never hardcoded (josu's wiring rule). */
  kpis?: Kpi[];
  /** Demo-mode account for this page/tab; defaults to the product's. */
  demo?: PersonaId | null;
}) {
  const path = usePathname();
  const p = product ? PRODUCTS.find((x) => x.id === product)! : productForPath(path);
  return (
    <div className="grid gap-8">
      <ProductHero product={p.id} title={title} purpose={purpose ?? p.purpose} kpis={kpis} demo={demo === null ? undefined : (demo ?? p.demo)} />
      {list}
      <div className="min-w-0">{children}</div>
    </div>
  );
}

/** Product header: solid icon chip + product name + one-line purpose, then up to 3 unboxed KPIs. */
export function ProductHero({
  product,
  title,
  purpose,
  kpis,
  demo,
}: {
  product: ProductId;
  title?: string;
  purpose?: ReactNode;
  kpis?: Kpi[];
  demo?: PersonaId;
}) {
  const p = PRODUCTS.find((x) => x.id === product)!;
  const persona = useDemoAccount(demo);
  const { address } = useConnection();
  const Icon = p.icon;
  return (
    <section className="grid gap-7 pt-2">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-4">
          <span className="bg-product grid size-14 shrink-0 place-items-center rounded-[16px] text-white" style={p.id === "home" ? { background: "var(--ink)" } : undefined}>
            <Icon className="size-7" strokeWidth={1.75} aria-hidden />
          </span>
          <div className="max-w-2xl">
            <h1 className="text-[2.1rem] leading-tight font-semibold tracking-tight sm:text-[2.6rem]">{p.id === "home" ? (title ?? p.name) : p.name}</h1>
            {(purpose ?? p.purpose) && <p className="text-muted-foreground mt-1 text-base text-pretty">{purpose ?? p.purpose}</p>}
          </div>
        </div>
        {persona && (
          <a
            href={address ? explorerAddress(address) : undefined}
            target="_blank"
            rel="noreferrer"
            className="bg-well text-muted-foreground hover:text-foreground rounded-[8px] px-2.5 py-1 text-[13px]"
            title="Testnet demo key, no real value"
          >
            Demo account · <span className="text-foreground font-medium">{persona.name}</span>
            {address && persona.address?.toLowerCase() === address.toLowerCase() && <span className="font-mono"> · {shortAddr(address)}</span>}
          </a>
        )}
      </div>
      {kpis && kpis.length > 0 && (
        <dl className="grid grid-cols-1 gap-5 sm:grid-cols-3 sm:gap-10">
          {kpis.slice(0, 3).map((k) => (
            <div key={k.label} className="min-w-0">
              <dt className="text-muted-foreground text-sm">{k.label}</dt>
              <dd className="mt-1 truncate text-[2rem] leading-none font-semibold tracking-tight tabular sm:text-[2.6rem]">{k.value}</dd>
              {k.sub && <dd className="text-muted-foreground mt-1 text-[13px]">{k.sub}</dd>}
            </div>
          ))}
        </dl>
      )}
    </section>
  );
}

export type ListItemDef = { id: string; label: string; icon?: LucideIcon; hint?: ReactNode };

/** Section tabs under the hero (scrolls horizontally on phones). */
export function ListPane({ items, value, onChange, label }: { items: ListItemDef[]; value: string; onChange: (id: string) => void; label: string }) {
  return (
    <nav aria-label={label} role="tablist" className="scrollbar-none -mx-4 flex gap-1 overflow-x-auto border-b px-4 sm:mx-0 sm:px-0">
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
              "-mb-px flex shrink-0 items-center gap-2 border-b-[3px] px-3 py-3 text-base transition-colors duration-150",
              on ? "border-product font-semibold" : "text-muted-foreground hover:text-foreground border-transparent",
            )}
          >
            {Icon && <Icon className={cn("size-[18px]", on && "text-product")} strokeWidth={1.75} aria-hidden />}
            {it.label}
            {it.hint && <span className="text-muted-foreground text-[13px] tabular">{it.hint}</span>}
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
    <section className={cn("animate-in fade-in-0 duration-150", card && "bg-well rounded-[20px]", className)}>
      {(title || aside) && (
        <header className={cn("flex flex-wrap items-start justify-between gap-3", card && "px-5 pt-5 sm:px-6")}>
          <div className="min-w-0">
            {title && <h2 className="text-xl font-semibold tracking-tight">{title}</h2>}
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
    <p className={cn("text-[2.6rem] leading-none font-semibold tracking-tight tabular sm:text-5xl", className)}>
      {value}
      {unit && <span className="text-muted-foreground ml-2 text-lg font-medium tracking-normal">{unit}</span>}
    </p>
  );
}

export function PanelActions({ children }: { children: ReactNode }) {
  return <div className="mt-6 grid gap-3 sm:flex sm:flex-wrap [&>*]:sm:min-w-48">{children}</div>;
}
