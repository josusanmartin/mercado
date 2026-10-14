"use client";
// System-Settings layout for inner screens: a left list of sections and a right content panel made of
// plain label/value rows with 1px dividers. Primary actions are wide pills at the bottom of the panel.
import type { ReactNode } from "react";
import Link from "next/link";
import { ChevronLeft, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export function SettingsLayout({ title, list, children }: { title: string; list: ReactNode; children: ReactNode }) {
  return (
    <div className="grid gap-6">
      <div className="flex items-center gap-3">
        <Link
          href="/"
          aria-label="Back to Home"
          className="bg-card shadow-tile grid size-10 shrink-0 place-items-center rounded-full transition-transform duration-150 hover:scale-105"
        >
          <ChevronLeft className="size-5 stroke-[1.5]" />
        </Link>
        <h1 className="text-2xl font-semibold sm:text-[1.75rem]">{title}</h1>
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[17rem_minmax(0,1fr)] lg:gap-10">
        <div className="lg:sticky lg:top-28 lg:self-start">{list}</div>
        <div className="min-w-0">{children}</div>
      </div>
    </div>
  );
}

export type ListItemDef = { id: string; label: string; icon?: LucideIcon; hint?: ReactNode };

/** Vertical section list. On phones it scrolls horizontally as pills so the panel stays in view. */
export function ListPane({ items, value, onChange, label }: { items: ListItemDef[]; value: string; onChange: (id: string) => void; label: string }) {
  return (
    <nav aria-label={label} data-nav="list" className="scrollbar-none -mx-4 flex gap-2 overflow-x-auto px-4 py-1 lg:mx-0 lg:grid lg:gap-0 lg:overflow-visible lg:px-0">
      {items.map((it) => {
        const on = it.id === value;
        const Icon = it.icon;
        return (
          <button
            key={it.id}
            type="button"
            data-nav-item=""
            aria-current={on ? "true" : undefined}
            onClick={() => onChange(it.id)}
            onFocus={() => onChange(it.id)}
            className={cn(
              "relative flex shrink-0 items-center gap-3 rounded-full px-4 py-2 text-left text-[15px] transition-colors duration-150",
              "lg:min-h-14 lg:rounded-[10px] lg:px-4 lg:py-3",
              on ? "bg-card shadow-tile font-medium lg:bg-transparent lg:shadow-none" : "text-muted-foreground hover:text-foreground",
            )}
          >
            <span className={cn("bg-foreground absolute top-3 bottom-3 left-0 hidden w-1 rounded-full", on && "lg:block")} />
            {Icon && <Icon className="hidden size-5 stroke-[1.5] lg:block" aria-hidden />}
            <span className="flex-1">{it.label}</span>
            {it.hint && <span className="text-muted-foreground hidden text-sm lg:inline">{it.hint}</span>}
          </button>
        );
      })}
    </nav>
  );
}

export function Panel({ title, description, aside, children, className }: { title?: ReactNode; description?: ReactNode; aside?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn("bg-card shadow-tile animate-in fade-in-0 slide-in-from-right-3 rounded-[14px] duration-150", className)}>
      {(title || aside) && (
        <header className="flex flex-wrap items-start justify-between gap-3 px-5 pt-5 sm:px-7 sm:pt-6">
          <div className="min-w-0">
            {title && <h2 className="text-xl font-semibold">{title}</h2>}
            {description && <p className="text-muted-foreground mt-1 max-w-prose text-[15px] text-pretty">{description}</p>}
          </div>
          {aside}
        </header>
      )}
      <div className="px-5 pt-2 pb-5 sm:px-7 sm:pb-7">{children}</div>
    </section>
  );
}

/** Plain row: label left, value right, 1px divider. */
export function Row({ label, value, sub, className }: { label: ReactNode; value: ReactNode; sub?: ReactNode; className?: string }) {
  return (
    <div className={cn("flex min-h-16 items-center justify-between gap-4 border-b py-3 last:border-b-0", className)}>
      <div className="min-w-0">
        <div className="text-[15px]">{label}</div>
        {sub && <div className="text-muted-foreground text-xs">{sub}</div>}
      </div>
      <div className="text-right text-[15px] font-medium tabular">{value}</div>
    </div>
  );
}

export function Rows({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("grid", className)}>{children}</div>;
}

/** Big number with a small unit, for the one figure that matters in a panel. */
export function BigNumber({ value, unit, className }: { value: ReactNode; unit?: ReactNode; className?: string }) {
  return (
    <p className={cn("text-[2.5rem] leading-none font-semibold tabular sm:text-5xl", className)}>
      {value}
      {unit && <span className="text-muted-foreground ml-2 text-lg font-normal">{unit}</span>}
    </p>
  );
}

export function PanelActions({ children }: { children: ReactNode }) {
  return <div className="mt-6 grid gap-3 sm:flex sm:flex-wrap [&>*]:sm:min-w-56">{children}</div>;
}
