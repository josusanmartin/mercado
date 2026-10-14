"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeftRight, Coins, FileCode2, HandCoins, Home, Receipt, Sprout } from "lucide-react";
import { cn } from "@/lib/utils";

export const NAV = [
  { href: "/", label: "Home", icon: Home },
  { href: "/mint", label: "Create pesos", icon: Coins },
  { href: "/send", label: "Send money", icon: ArrowLeftRight },
  { href: "/credit", label: "Get an advance", icon: HandCoins },
  { href: "/pay", label: "Pay bills", icon: Receipt },
  { href: "/earn", label: "Earn", icon: Sprout },
] as const;

const isActive = (path: string, href: string) => (href === "/" ? path === "/" : path.startsWith(href));

export function SideNav() {
  const path = usePathname();
  return (
    <nav aria-label="Main" className="flex flex-col gap-0.5">
      {NAV.map(({ href, label, icon: Icon }) => {
        const active = isActive(path, href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "group relative flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
              active ? "bg-card text-foreground font-medium shadow-xs" : "text-muted-foreground hover:bg-card/60 hover:text-foreground",
            )}
          >
            <span className={cn("absolute inset-y-2 left-0 w-0.5 rounded-full", active ? "bg-brand" : "bg-transparent")} />
            <Icon className={cn("size-4", active ? "text-primary" : "")} aria-hidden />
            {label}
          </Link>
        );
      })}
      <div className="my-3 h-px bg-border" />
      <Link
        href="/contracts"
        aria-current={path.startsWith("/contracts") ? "page" : undefined}
        className={cn(
          "flex items-center gap-3 rounded-md px-3 py-2 text-sm",
          path.startsWith("/contracts") ? "bg-card font-medium shadow-xs" : "text-muted-foreground hover:bg-card/60 hover:text-foreground",
        )}
      >
        <FileCode2 className="size-4" aria-hidden />
        Contracts
      </Link>
    </nav>
  );
}

export function MobileNav() {
  const path = usePathname();
  const items = [...NAV, { href: "/contracts", label: "Contracts", icon: FileCode2 }];
  return (
    <nav aria-label="Main" className="-mx-4 flex gap-1 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
      {items.map(({ href, label }) => {
        const active = isActive(path, href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "shrink-0 rounded-full border px-3 py-1.5 text-sm",
              active ? "border-primary bg-primary text-primary-foreground" : "bg-card text-muted-foreground",
            )}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
