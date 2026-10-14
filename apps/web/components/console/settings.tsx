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
    <div className="grid gap-6">
      <ProductHero product={p.id} title={title} purpose={purpose ?? p.purpose} kpis={kpis} demo={demo === null ? undefined : (demo ?? p.demo)} />
      {list}
      <div className="min-w-0">{children}</div>
    </div>
  );
}

/** Hero band: product name in its color, page title, purpose, live KPIs over the product's art. */
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
  return (
    <section className="relative isolate overflow-hidden rounded-[14px] bg-[#15110e] text-[#f5efe4]">
      <div
        aria-hidden
        className="absolute inset-0 -z-10 bg-cover bg-right opacity-90"
        style={{ backgroundImage: `url(/art/${p.id}.webp)` }}
      />
      <div aria-hidden className="absolute inset-0 -z-10 bg-gradient-to-r from-[#15110e] via-[#15110e]/85 to-[#15110e]/10" />
      <div className="grid gap-6 p-6 sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="max-w-2xl">
            <p className="flex items-center gap-2 text-sm font-semibold" style={{ color: p.id === "home" ? "#f5efe4" : `color-mix(in oklab, ${p.color} 70%, white)` }}>
              <span className="size-2.5 rounded-full" style={{ background: p.id === "home" ? "#f5efe4" : p.color }} aria-hidden />
              {p.name}
            </p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight text-balance sm:text-[2.6rem] sm:leading-[1.05]">{title ?? p.name}</h1>
            {purpose && <p className="mt-2 max-w-xl text-[15px] text-pretty text-[#f5efe4]/75">{purpose}</p>}
          </div>
          {persona && (
            <a
              href={address ? explorerAddress(address) : undefined}
              target="_blank"
              rel="noreferrer"
              className="rounded-md border border-white/20 bg-white/5 px-2.5 py-1 text-xs text-[#f5efe4]/85 hover:bg-white/10"
              title="Testnet demo key, no real value"
            >
              Demo account · {persona.name}
              {address && persona.address?.toLowerCase() === address.toLowerCase() && <span className="font-mono"> · {shortAddr(address)}</span>}
            </a>
          )}
        </div>
        {kpis && kpis.length > 0 && (
          <dl className="grid grid-cols-3 gap-3 sm:gap-8">
            {kpis.slice(0, 3).map((k) => (
              <div key={k.label} className="min-w-0">
                <dt className="truncate text-[11px] text-[#f5efe4]/65 sm:text-xs">{k.label}</dt>
                <dd className="mt-0.5 truncate text-xl font-semibold tracking-tight tabular sm:text-4xl">{k.value}</dd>
                {k.sub && <dd className="hidden text-xs text-[#f5efe4]/60 sm:block">{k.sub}</dd>}
              </div>
            ))}
          </dl>
        )}
      </div>
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
              "-mb-px flex shrink-0 items-center gap-2 border-b-2 px-3 py-2.5 text-[15px] transition-colors duration-150",
              on ? "border-product font-semibold" : "text-muted-foreground hover:text-foreground border-transparent",
            )}
          >
            {Icon && <Icon className={cn("size-4", on && "text-product")} aria-hidden />}
            {it.label}
            {it.hint && <span className="bg-well text-muted-foreground rounded px-1.5 py-0.5 text-xs tabular">{it.hint}</span>}
          </button>
        );
      })}
    </nav>
  );
}

export function Panel({
  title,
  description,
  aside,
  children,
  className,
}: {
  title?: ReactNode;
  description?: ReactNode;
  aside?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("bg-card shadow-tile animate-in fade-in-0 rounded-[14px] border duration-150", className)}>
      {(title || aside) && (
        <header className="flex flex-wrap items-start justify-between gap-3 px-5 pt-5 sm:px-6">
          <div className="min-w-0">
            {title && <h2 className="text-lg font-semibold">{title}</h2>}
            {description && <p className="text-muted-foreground mt-1 max-w-prose text-sm text-pretty">{description}</p>}
          </div>
          {aside}
        </header>
      )}
      <div className="px-5 pt-3 pb-5 sm:px-6 sm:pb-6">{children}</div>
    </section>
  );
}

/** Plain row: label left, value right, 1px divider. */
export function Row({ label, value, sub, className }: { label: ReactNode; value: ReactNode; sub?: ReactNode; className?: string }) {
  return (
    <div className={cn("flex min-h-13 items-center justify-between gap-4 border-b py-2.5 last:border-b-0", className)}>
      <div className="min-w-0">
        <div className="text-[15px]">{label}</div>
        {sub && <div className="text-muted-foreground text-xs">{sub}</div>}
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
    <p className={cn("text-product text-5xl leading-none font-semibold tracking-tight tabular sm:text-6xl", className)}>
      {value}
      {unit && <span className="text-muted-foreground ml-2 text-lg font-medium tracking-normal">{unit}</span>}
    </p>
  );
}

export function PanelActions({ children }: { children: ReactNode }) {
  return <div className="mt-6 grid gap-3 sm:flex sm:flex-wrap [&>*]:sm:min-w-48">{children}</div>;
}
