"use client";
// Big rounded-square tiles in one horizontal row. The selected tile's title shows above the row in the
// accent color; the selected tile scales up slightly. On phones the row becomes a 2-column grid.
import Link from "next/link";
import { useState, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type TileProps = {
  title: string;
  icon: LucideIcon;
  /** One live number, e.g. "1,400". */
  value?: ReactNode;
  /** Caption under the number, e.g. "xMXN available". */
  caption?: ReactNode;
  href?: string;
  onClick?: () => void;
  badge?: ReactNode;
};

export function TileRow({ tiles, label }: { tiles: TileProps[]; label: string }) {
  const [sel, setSel] = useState(0);
  const current = tiles[sel] ?? tiles[0];
  return (
    <section aria-label={label} className="grid gap-3">
      <p aria-hidden className="text-select hidden h-8 px-1 text-2xl font-medium sm:block">
        {current?.title}
      </p>
      <div
        data-nav="row"
        className="-mx-4 grid grid-cols-2 gap-3 px-4 py-2 sm:mx-0 sm:flex sm:gap-5 sm:overflow-x-auto sm:px-2 sm:py-3 scrollbar-none"
      >
        {tiles.map((t, i) => (
          <Tile key={t.title} {...t} selected={i === sel} onSelect={() => setSel(i)} />
        ))}
      </div>
    </section>
  );
}

export function Tile({ title, icon: Icon, value, caption, href, onClick, badge, selected, onSelect }: TileProps & { selected?: boolean; onSelect?: () => void }) {
  const body = (
    <>
      {badge && <span className="absolute top-3 right-3">{badge}</span>}
      <Icon className="size-12 stroke-[1.4] sm:size-16" aria-hidden />
      <span className="grid gap-0.5 text-center">
        {value !== undefined && <span className="text-xl font-semibold tabular sm:text-2xl">{value}</span>}
        {caption && <span className="text-muted-foreground text-xs sm:text-sm">{caption}</span>}
        <span className="mt-1 text-sm font-medium sm:sr-only">{title}</span>
      </span>
    </>
  );
  const cls = cn(
    "bg-card shadow-tile relative flex aspect-square shrink-0 flex-col items-center justify-center gap-4 rounded-[14px] p-4 text-center",
    "transition-transform duration-150 ease-out sm:w-[15.5rem] lg:w-[16.5rem]",
    "hover:scale-[1.04] focus-visible:scale-[1.04]",
    selected && "sm:scale-[1.04]",
  );
  const common = {
    "data-nav-item": "",
    "data-active": selected ? "true" : undefined,
    "aria-label": title,
    className: cls,
    onFocus: onSelect,
    onMouseEnter: onSelect,
  };
  return href ? (
    <Link href={href} {...common}>
      {body}
    </Link>
  ) : (
    <button type="button" onClick={onClick} {...common}>
      {body}
    </button>
  );
}
