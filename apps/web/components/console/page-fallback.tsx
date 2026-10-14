// Server-rendered stand-ins for the client-only screens (P0, lead 05:22: josu saw a blank app over a slow
// relay). Pages render their wallet-driven screen only after hydration (ClientOnly), so until JS runs (or if it
// never does) this is what's on screen: the real header in the product's color world, its purpose, and a clear
// "connecting" line. No hooks, no live numbers, nothing invented.
import type { ReactNode } from "react";
import { PRODUCTS, type ProductId } from "./products";

function Connecting() {
  return (
    <>
      <p className="meta text-muted-foreground">Connecting to Tempo testnet…</p>
      <noscript>
        <p className="max-w-2xl text-[15px]">This demo runs live on Tempo testnet: it needs JavaScript to read balances and send transactions.</p>
      </noscript>
    </>
  );
}

/** A product page before hydration: same header block as ProductHeader (static), purpose, "connecting". */
export function PageFallback({ product, title, purpose }: { product: ProductId; title?: string; purpose?: ReactNode }) {
  const p = PRODUCTS.find((x) => x.id === product)!;
  const world = product !== "home";
  return (
    <section aria-busy="true" className="grid min-w-0 gap-3 [container-type:inline-size]">
      <div className={world ? "-mx-4 -mt-5 grid gap-2 bg-[var(--hero-bg)] px-4 pt-4 pb-5 text-[var(--hero-fg)] sm:-mx-8 sm:-mt-8 sm:px-8" : "grid gap-2"}>
        <p className={world ? "meta border-b border-current/25 pb-2" : "meta text-muted-foreground border-b pb-2"}>
          {p.index} · {p.id === "home" ? "Mercado" : p.name}
        </p>
        <h1 className="display text-[clamp(2.2rem,12.5cqw,4.5rem)] break-words">{title ?? p.short}</h1>
        <p className="line-clamp-2 max-w-5xl text-base leading-snug text-pretty sm:text-lg">{purpose ?? p.purpose}</p>
      </div>
      <Connecting />
    </section>
  );
}

/** Home before hydration: the hero and the six products (names and what they do; live numbers load after). */
export function HomeFallback() {
  return (
    <div aria-busy="true" className="grid min-w-0 gap-10 pt-1">
      <section className="grid gap-6 [container-type:inline-size]">
        <p className="meta text-muted-foreground border-b pb-3">■ 00 · Mercado · a peso economy on Tempo</p>
        <h1 className="display text-[clamp(2.2rem,15cqw,12rem)] sm:text-[clamp(2.2rem,min(10.9cqw,22svh),12rem)]">
          One currency.
          <br />
          Six products.
        </h1>
        <p className="max-w-2xl text-xl leading-snug text-pretty">
          Create pesos. Send them home. Borrow, spend, and save on Tempo.
        </p>
        <Connecting />
      </section>
      <ol className="border-t">
        {PRODUCTS.filter((p) => p.id !== "home").map((p) => (
          <li key={p.id} className="border-b">
            <a href={p.href} className="grid grid-cols-[2.5rem_minmax(0,1fr)] items-baseline gap-x-4 py-5 sm:grid-cols-[3rem_minmax(0,1fr)]">
              <span className="meta text-muted-foreground tabular">{p.index}</span>
              <span>
                <span className="display block text-[clamp(2.4rem,6vw,5rem)]">{p.short}</span>
                <span className="text-muted-foreground mt-1 block text-lg">— {p.line}</span>
              </span>
            </a>
          </li>
        ))}
      </ol>
    </div>
  );
}
