"use client";
// Ecosystem shell: product switcher sidebar (bottom tab bar on phones), top bar, honesty footer.
// Sets data-product so every component below picks up the product's signature color.
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useLayoutEffect, useRef, useState, type AnimationEvent, type ReactNode } from "react";
import { Boxes, Code2, Ellipsis, FileCode2, LayoutGrid, Moon, Route, Sun, X } from "lucide-react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { useTour } from "@/components/tour/demo-tour";
import { FreshLanding } from "@/lib/motion";
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
  // V5-TASTE #9: utility routes are their own destination; no product (not even Home) is active on them.
  const utility = isUtilityPath(path);
  const scrolled = useScrolled();
  // V6-TASTE #6: letters reveal only on a fresh landing; once the user navigates, titles render as whole words.
  const [landing] = useState(path);
  const [navigated, setNavigated] = useState(false);
  if (!navigated && path !== landing) setNavigated(true);
  return (
    <div data-product={product.id === "home" ? undefined : product.id} className="min-h-dvh lg:grid lg:grid-cols-[15rem_minmax(0,1fr)]">
      <Sidebar active={utility ? undefined : product.id} path={path} />
      {/* v5: each product page sits in a soft wash of its accent (none on Home). */}
      <div className={cn("flex min-h-dvh min-w-0 flex-col", product.id !== "home" && !utility && "mx-wash")}>
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
        <main id="main" className="mx-auto w-full max-w-[84rem] min-w-0 flex-1 px-4 pt-5 pb-[calc(var(--m-chrome,9rem)+1.5rem)] sm:px-8 sm:pt-8 lg:pb-24">
          {/* v5 route transition: each page enters with a short fade-slide (reduced motion: none). */}
          <FreshLanding.Provider value={!navigated}>
            <EnterGroup key={path}>{children}</EnterGroup>
          </FreshLanding.Provider>
        </main>
        <HintBar />
        <MobileTabs active={utility ? undefined : product.id} />
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

/** End of the route entrance: what's on the page now is settled (won't replay); later mounts animate (globals.css). */
function settle(group: HTMLElement) {
  if (group.hasAttribute("data-entered")) return;
  group.querySelectorAll(".mx-reveal, .mx-stagger > *").forEach((n) => {
    if (!n.closest(".m-root")) n.setAttribute("data-settled", "");
  });
  group.setAttribute("data-entered", "");
}

/** The route's one entrance owner. If the entrance already ran before hydration (server-rendered first load),
 *  settle on mount; otherwise settle when it ends. */
function EnterGroup({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (el && !el.getAnimations().some((a) => (a as CSSAnimation).animationName === "mx-enter" && a.playState === "running")) settle(el);
  }, []);
  return (
    <div ref={ref} className="mx-enter" onAnimationEnd={(e: AnimationEvent<HTMLDivElement>) => e.target === e.currentTarget && settle(e.currentTarget)}>
      {children}
    </div>
  );
}

const isUtilityPath = (path: string) => path.startsWith("/developers") || path.startsWith("/contracts");

function Sidebar({ active, path }: { active?: string; path: string }) {
  const { theme, toggle } = useTheme();
  // v5: one accent pill that glides to the active row (measured, so it follows any row height).
  const rows = useRef<Record<string, HTMLAnchorElement | null>>({});
  const [pill, setPill] = useState<{ y: number; h: number }>();
  useLayoutEffect(() => {
    const el = active ? rows.current[active] : null;
    setPill(el ? { y: el.offsetTop, h: el.offsetHeight } : undefined);
  }, [active]);
  return (
    <aside className="bg-background sticky top-0 hidden h-dvh flex-col border-r px-4 py-6 lg:flex">
      <Link href="/" className="mb-8 px-2" aria-label="Mercado home">
        <Wordmark />
      </Link>
      <nav aria-label="Products" className="relative grid">
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
                "group relative flex items-baseline gap-3 px-2 py-2.5 transition-colors duration-200",
                on ? "text-[var(--on-accent)]" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {/* V5-TASTE #9: a quiet rail: Inter Tight 15/600 labels, 11px index, no rule under every row. */}
              <span className="w-5 text-[11px] tracking-wide tabular">{p.index}</span>
              <span className="flex-1 text-[15px] font-semibold">{p.id === "home" ? "Home" : p.short}</span>
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
            "meta flex items-center gap-3 rounded-[4px] border-l-2 px-2 py-2",
            path.startsWith("/developers") ? "border-foreground bg-well text-foreground" : "text-muted-foreground hover:text-foreground border-transparent",
          )}
        >
          <Code2 className="size-4" aria-hidden />
          Developers
        </Link>
        <Link
          href="/contracts"
          aria-current={path.startsWith("/contracts") ? "page" : undefined}
          className={cn(
            "meta flex items-center gap-3 rounded-[4px] border-l-2 px-2 py-2",
            path.startsWith("/contracts") ? "border-foreground bg-well text-foreground" : "text-muted-foreground hover:text-foreground border-transparent",
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

/**
 * V5-TASTE #4: the phone console's navigation. Four equal, stable destinations (Home, Products, Tour, More)
 * instead of a seven-slot rail that hid Invest offscreen. Products lists all six (current one marked); More
 * holds Developers, Contracts and the theme. It and the honesty footer above it are opaque, and their
 * measured height is reserved at the bottom of the page (--m-chrome), so content never sits under them.
 */
function MobileTabs({ active }: { active?: string }) {
  const path = usePathname();
  const tour = useTour();
  const { theme, toggle } = useTheme();
  const nav = useRef<HTMLElement>(null);

  // Reserve the real height of the fixed chrome (nav + honesty footer) for the scroll area.
  useEffect(() => {
    const footer = document.querySelector<HTMLElement>("footer[data-honesty]");
    const set = () => {
      const h = (nav.current?.offsetHeight ?? 0) + (footer && getComputedStyle(footer).position === "fixed" ? footer.offsetHeight : 0);
      document.documentElement.style.setProperty("--m-chrome", `${h}px`);
    };
    set();
    const ro = new ResizeObserver(set);
    if (nav.current) ro.observe(nav.current);
    if (footer) ro.observe(footer);
    window.addEventListener("resize", set);
    return () => (ro.disconnect(), window.removeEventListener("resize", set));
  }, []);

  const tab = "meta flex flex-col items-center justify-center gap-1 text-[11px]";
  const isHome = active === "home";
  const inProduct = !!active && active !== "home";
  const utility = path.startsWith("/developers") || path.startsWith("/contracts");
  return (
    <nav
      ref={nav}
      data-phone-hide
      aria-label="Console"
      className="bg-background fixed inset-x-0 bottom-0 z-40 grid h-[calc(3.5rem+env(safe-area-inset-bottom))] grid-cols-4 border-t pb-[env(safe-area-inset-bottom)] lg:hidden"
    >
      <Link href="/" aria-current={isHome ? "page" : undefined} className={cn(tab, isHome ? "text-foreground" : "text-muted-foreground")}>
        <LayoutGrid className="size-5" strokeWidth={1.75} aria-hidden />
        Home
      </Link>
      <ConsoleMenu
        title="Products"
        trigger={
          <button type="button" className={cn(tab, inProduct ? "text-foreground" : "text-muted-foreground")}>
            <Boxes className="size-5" strokeWidth={1.75} aria-hidden />
            {inProduct ? PRODUCTS.find((p) => p.id === active)!.short : "Products"}
          </button>
        }
      >
        {PRODUCTS.filter((p) => p.id !== "home").map((p) => (
          <li key={p.id}>
            <DialogPrimitive.Close asChild>
              <Link
                href={p.href}
                aria-current={p.id === active ? "page" : undefined}
                className={cn("flex min-h-12 items-center gap-3 rounded-[4px] px-2", p.id === active && "bg-well")}
              >
                <span className="size-2.5 shrink-0" style={{ background: p.color }} aria-hidden />
                <span className="w-6 text-[11px] tabular">{p.index}</span>
                <span className="flex-1 text-[15px] font-semibold">{p.short}</span>
                <span className="text-muted-foreground truncate text-[13px]">{p.line}</span>
              </Link>
            </DialogPrimitive.Close>
          </li>
        ))}
      </ConsoleMenu>
      <button
        type="button"
        onClick={() => (tour.active && !tour.finished ? tour.setMinimized(false) : tour.start())}
        disabled={tour.going}
        className={cn(tab, tour.active ? "text-foreground" : "text-muted-foreground")}
      >
        <Route className="size-5" strokeWidth={1.75} aria-hidden />
        {tour.active && !tour.finished ? `Tour ${tour.index + 1}/6` : "Tour"}
      </button>
      <ConsoleMenu
        title="More"
        trigger={
          <button type="button" className={cn(tab, utility ? "text-foreground" : "text-muted-foreground")}>
            <Ellipsis className="size-5" strokeWidth={1.75} aria-hidden />
            More
          </button>
        }
      >
        {[
          { href: "/developers", label: "Developers", Icon: Code2 },
          { href: "/contracts", label: "Contracts", Icon: FileCode2 },
        ].map(({ href, label, Icon }) => (
          <li key={href}>
            <DialogPrimitive.Close asChild>
              <Link
                href={href}
                aria-current={path.startsWith(href) ? "page" : undefined}
                className={cn("flex min-h-12 items-center gap-3 rounded-[4px] px-2 text-[15px] font-semibold", path.startsWith(href) && "bg-well")}
              >
                <Icon className="size-4" aria-hidden /> {label}
              </Link>
            </DialogPrimitive.Close>
          </li>
        ))}
        <li>
          <button type="button" onClick={toggle} className="flex min-h-12 w-full items-center gap-3 rounded-[4px] px-2 text-left text-[15px] font-semibold">
            {theme === "dark" ? <Sun className="size-4" aria-hidden /> : <Moon className="size-4" aria-hidden />}
            {theme === "dark" ? "Light theme" : "Dark theme"}
          </button>
        </li>
      </ConsoleMenu>
    </nav>
  );
}

/**
 * A console menu sheet on the Radix Dialog primitive (review P1, lead 06:44): focus moves into the menu and is
 * trapped there, the rest of the page is inert, Escape / the scrim / Close return focus to the tab that opened
 * it, and the menu has a visible title. Its links close it as they navigate.
 */
function ConsoleMenu({ title, trigger, children }: { title: string; trigger: ReactNode; children: ReactNode }) {
  return (
    <DialogPrimitive.Root>
      <DialogPrimitive.Trigger asChild>{trigger}</DialogPrimitive.Trigger>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay data-phone-hide className="fixed inset-0 z-40 bg-black/30 lg:hidden" />
        <DialogPrimitive.Content
          data-phone-hide
          aria-describedby={undefined}
          className="bg-background fixed inset-x-0 bottom-[var(--m-chrome,7rem)] z-50 rounded-t-[8px] border-t px-4 pt-3 pb-2 outline-none lg:hidden"
        >
          <div className="flex items-center justify-between px-2 pb-1">
            <DialogPrimitive.Title className="meta text-muted-foreground">{title}</DialogPrimitive.Title>
            <DialogPrimitive.Close className="text-muted-foreground hover:text-foreground -mr-1 rounded-full p-2" aria-label={`Close ${title}`}>
              <X className="size-4" aria-hidden />
            </DialogPrimitive.Close>
          </div>
          <ul className="grid">{children}</ul>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
