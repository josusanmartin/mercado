"use client";
// Ecosystem shell: product switcher sidebar (bottom tab bar on phones), top bar, honesty footer.
// Sets data-product so every component below picks up the product's signature color.
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Code2, FileCode2, Moon, Sun } from "lucide-react";
import { cn } from "@/lib/utils";
import { PRODUCTS, productForPath } from "./products";
import { TopBar } from "./top-bar";
import { HintBar } from "./hint-bar";
import { useTheme } from "./theme";
import { ClientOnly } from "./client-only";

/** v5: the sticky header blurs and shows its hairline only once the page has scrolled. */
function useScrolled() {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 4);
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);
  return scrolled;
}

export function AppShell({ children }: { children: ReactNode }) {
  const path = usePathname();
  const product = productForPath(path);
  const scrolled = useScrolled();
  return (
    <div data-product={product.id === "home" ? undefined : product.id} className="min-h-dvh lg:grid lg:grid-cols-[15rem_minmax(0,1fr)]">
      <Sidebar active={product.id} path={path} />
      {/* v5: each product page sits in a soft wash of its accent (none on Home). */}
      <div className={cn("flex min-h-dvh min-w-0 flex-col", product.id !== "home" && "mx-wash")}>
        <header
          className={cn(
            "sticky top-0 z-30 border-b transition-[background-color,border-color] duration-200",
            scrolled ? "bg-background/75 border-border backdrop-blur-md" : "bg-background/0 border-transparent",
          )}
        >
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
          {/* v5 route transition: each page enters with a short fade-slide (reduced motion: none). */}
          <div key={path} className="mx-enter">
            {children}
          </div>
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
      <span className="grid grid-cols-3 gap-[2px]" aria-hidden>
        {["--c-mint", "--c-remesas", "--c-global", "--c-credito", "--ink", "--c-invest"].map((c) => (
          <span key={c} className="size-[7px]" style={{ background: `var(${c})` }} />
        ))}
      </span>
      <span className={cn("display text-[1.35rem]", compact && "hidden sm:inline")}>Mercado</span>
    </span>
  );
}

function Sidebar({ active, path }: { active: string; path: string }) {
  const { theme, toggle } = useTheme();
  // v5: one accent pill that glides to the active row (measured, so it follows any row height).
  const rows = useRef<Record<string, HTMLAnchorElement | null>>({});
  const [pill, setPill] = useState<{ y: number; h: number }>();
  useLayoutEffect(() => {
    const el = rows.current[active];
    if (el) setPill({ y: el.offsetTop, h: el.offsetHeight });
  }, [active]);
  return (
    <aside className="bg-background sticky top-0 hidden h-dvh flex-col border-r px-4 py-6 lg:flex">
      <Link href="/" className="mb-8 px-2" aria-label="Mercado home">
        <Wordmark />
      </Link>
      <nav aria-label="Products" className="relative grid border-t">
        {pill && (
          <span
            data-product={active}
            aria-hidden
            className="mx-pill absolute inset-x-0 top-0 rounded-[4px] bg-[var(--accent)]"
            style={{ transform: `translateY(${pill.y}px)`, height: pill.h }}
          />
        )}
        {PRODUCTS.map((p) => {
          const on = p.id === active;
          return (
            <Link
              key={p.id}
              ref={(el) => {
                rows.current[p.id] = el;
              }}
              href={p.href}
              aria-current={on ? "page" : undefined}
              data-product={on ? p.id : undefined}
              className={cn(
                "mx-press group relative flex items-baseline gap-3 border-b px-2 py-3 transition-colors duration-200",
                on ? "border-transparent text-[var(--on-accent)]" : "text-muted-foreground hover:text-foreground",
              )}
            >
              <span className="meta w-5 tabular">{p.index}</span>
              <span className="display flex-1 text-[1.05rem]">{p.id === "home" ? "Home" : p.short}</span>
              <span
                className={cn("size-2 shrink-0 self-center transition-colors duration-200", on && "outline outline-1 outline-current")}
                style={{ background: p.id === "home" ? "var(--ink)" : p.color }}
                aria-hidden
              />
            </Link>
          );
        })}
      </nav>
      <div className="mt-auto grid gap-0.5 border-t pt-3">
        <Link
          href="/developers"
          aria-current={path.startsWith("/developers") ? "page" : undefined}
          className={cn(
            "meta flex items-center gap-3 px-2 py-2",
            path.startsWith("/developers") ? "text-foreground" : "text-muted-foreground hover:text-foreground",
          )}
        >
          <Code2 className="size-4" aria-hidden />
          Developers
        </Link>
        <Link
          href="/contracts"
          aria-current={path.startsWith("/contracts") ? "page" : undefined}
          className={cn(
            "meta flex items-center gap-3 px-2 py-2",
            path.startsWith("/contracts") ? "text-foreground" : "text-muted-foreground hover:text-foreground",
          )}
        >
          <FileCode2 className="size-4" aria-hidden />
          Contracts
        </Link>
        <button type="button" onClick={toggle} className="meta text-muted-foreground hover:text-foreground flex items-center gap-3 px-2 py-2 text-left">
          {theme === "dark" ? <Sun className="size-4" aria-hidden /> : <Moon className="size-4" aria-hidden />}
          {theme === "dark" ? "Light theme" : "Dark theme"}
        </button>
      </div>
    </aside>
  );
}

function MobileTabs({ active }: { active: string }) {
  return (
    <nav data-phone-hide aria-label="Products" className="bg-card scrollbar-none fixed inset-x-0 bottom-0 z-40 flex overflow-x-auto border-t pb-[env(safe-area-inset-bottom)] lg:hidden">
      {PRODUCTS.map((p) => {
        const on = p.id === active;
        const Icon = p.icon;
        return (
          <Link key={p.id} href={p.href} aria-current={on ? "page" : undefined} className={cn("meta flex min-w-16 flex-1 flex-col items-center gap-1 px-1 py-2", on ? "text-foreground" : "text-muted-foreground")}>
            <Icon className="size-5" strokeWidth={1.75} style={on ? { color: p.color } : undefined} aria-hidden />
            {p.id === "home" ? "Home" : p.short}
          </Link>
        );
      })}
    </nav>
  );
}
