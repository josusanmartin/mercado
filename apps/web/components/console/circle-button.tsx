"use client";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type CircleButtonProps = { label: string; icon: LucideIcon; href?: string; onClick?: () => void; active?: boolean };

/** Round icon button with its label underneath (bottom row of Home). */
export function CircleButton({ label, icon: Icon, href, onClick, active }: CircleButtonProps) {
  const inner = (
    <>
      <span
        className={cn(
          "bg-card shadow-tile grid size-12 place-items-center rounded-full transition-transform duration-150 ease-out group-hover:scale-105 sm:size-16",
          active && "bg-primary text-primary-foreground",
        )}
      >
        <Icon className="size-5 stroke-[1.5] sm:size-6" aria-hidden />
      </span>
      <span className="text-muted-foreground text-xs sm:text-sm">{label}</span>
    </>
  );
  const cls = "group flex w-16 flex-col items-center gap-2 rounded-full focus-visible:outline-offset-4 sm:w-20";
  return href ? (
    <Link href={href} data-nav-item="" className={cls} target={href.startsWith("http") ? "_blank" : undefined}>
      {inner}
    </Link>
  ) : (
    <button type="button" data-nav-item="" onClick={onClick} className={cls}>
      {inner}
    </button>
  );
}

export function CircleRow({ items }: { items: CircleButtonProps[] }) {
  return (
    <nav aria-label="Shortcuts" data-nav="row" className="flex flex-wrap justify-center gap-1.5 sm:gap-6">
      {items.map((i) => (
        <CircleButton key={i.label} {...i} />
      ))}
    </nav>
  );
}
