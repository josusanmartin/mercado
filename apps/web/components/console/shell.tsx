"use client";
// Ecosystem shell: product switcher sidebar (bottom tab bar on phones), top bar, honesty footer.
// Sets data-product so every component below picks up the product's signature color.
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { FileCode2, Moon, Sun } from "lucide-react";
import { cn } from "@/lib/utils";
import { PRODUCTS, productForPath } from "./products";
import { TopBar } from "./top-bar";
import { HintBar } from "./hint-bar";
import { useTheme } from "./theme";
import { ClientOnly } from "./client-only";

export function AppShell({ children }: { children: ReactNode }) {
  const path = usePathname();
  const product = productForPath(path);
  return (
    <div data-product={product.id === "home" ? undefined : product.id} className="min-h-dvh lg:grid lg:grid-cols-[15rem_minmax(0,1fr)]">
      <Sidebar active={product.id} path={path} />
      <div className="flex min-h-dvh min-w-0 flex-col">
        <header className="bg-background/90 supports-[backdrop-filter]:bg-background/75 sticky top-0 z-30 backdrop-blur">
          <div className="mx-auto flex max-w-[84rem] items-center gap-2 px-4 py-3 sm:gap-3 sm:px-8">
            <Link href="/" className="flex items-center gap-2 lg:hidden" aria-label="Mercado home">
              <Wordmark compact />
            </Link>
            <ClientOnly fallback={<div className="ml-auto h-9 w-64" />}>
              <TopBar />
            </ClientOnly>
          </div>
        </header>
        <main id="main" className="mx-auto w-full max-w-[84rem] min-w-0 flex-1 px-4 pt-5 pb-36 sm:px-8 sm:pt-8 lg:pb-24">
          {children}
        </main>
        <HintBar />
        <MobileTabs active={product.id} />
      </div>
    </div>
  );
}

export function Wordmark({ className, compact }: { className?: string; compact?: boolean }) {
  return (
    <span className={cn("flex items-center gap-2", className)}>
      <span className="grid size-7 grid-cols-2 grid-rows-2 gap-[3px]" aria-hidden>
        <span className="bg-mint rounded-[3px]" />
        <span className="bg-remesas rounded-[3px]" />
        <span className="bg-global rounded-[3px]" />
        <span className="bg-credito rounded-[3px]" />
      </span>
      <span className={cn("text-lg font-bold tracking-tight", compact && "hidden sm:inline")}>Mercado</span>
    </span>
  );
}

function Sidebar({ active, path }: { active: string; path: string }) {
  const { theme, toggle } = useTheme();
  return (
    <aside className="bg-background sticky top-0 hidden h-dvh flex-col border-r px-3 py-6 lg:flex">
      <Link href="/" className="mb-7 px-2" aria-label="Mercado home">
        <Wordmark />
      </Link>
      <nav aria-label="Products" className="grid gap-0.5">
        {PRODUCTS.map((p) => {
          const on = p.id === active;
          return (
            <Link
              key={p.id}
              href={p.href}
              aria-current={on ? "page" : undefined}
              className={cn(
                "relative flex items-center gap-3 rounded-[10px] px-3 py-2.5 text-[15px] transition-colors duration-150",
                on ? "bg-well font-semibold" : "hover:bg-well/70",
              )}
            >
              <span className="grid size-7 shrink-0 place-items-center rounded-[8px] text-white" style={{ background: p.color }} aria-hidden>
                <p.icon className="size-4" strokeWidth={1.75} />
              </span>
              <span className="flex-1">{p.id === "home" ? "Overview" : p.short}</span>
            </Link>
          );
        })}
      </nav>
      <div className="mt-auto grid gap-0.5 border-t pt-3">
        <Link
          href="/contracts"
          aria-current={path.startsWith("/contracts") ? "page" : undefined}
          className={cn(
            "flex items-center gap-3 rounded-[10px] px-3 py-2 text-sm",
            path.startsWith("/contracts") ? "bg-well font-semibold" : "text-muted-foreground hover:text-foreground",
          )}
        >
          <FileCode2 className="size-4" aria-hidden />
          Contracts
        </Link>
        <button type="button" onClick={toggle} className="text-muted-foreground hover:text-foreground flex items-center gap-3 rounded-[10px] px-3 py-2 text-left text-sm">
          {theme === "dark" ? <Sun className="size-4" aria-hidden /> : <Moon className="size-4" aria-hidden />}
          {theme === "dark" ? "Light theme" : "Dark theme"}
        </button>
      </div>
    </aside>
  );
}

function MobileTabs({ active }: { active: string }) {
  return (
    <nav aria-label="Products" className="bg-card fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t pb-[env(safe-area-inset-bottom)] lg:hidden">
      {PRODUCTS.map((p) => {
        const on = p.id === active;
        const Icon = p.icon;
        return (
          <Link key={p.id} href={p.href} aria-current={on ? "page" : undefined} className={cn("flex flex-col items-center gap-1 py-2 text-[13px]", on ? "font-semibold" : "text-muted-foreground")}>
            <Icon className="size-5" strokeWidth={1.75} style={on ? { color: p.color } : undefined} aria-hidden />
            {p.id === "home" ? "Inicio" : p.short}
          </Link>
        );
      })}
    </nav>
  );
}
