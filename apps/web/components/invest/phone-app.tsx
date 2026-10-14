"use client";
// Mercado Invest phone app (crew/DESIGN-ECOSYSTEM.md §7, restyled per crew/PRINCIPLES.md on the mobile.md v2
// fintech structure; owned by mobile2, data + actions by api in use-invest.ts). Spanish only inside the phone;
// the longer "where the yield comes from" explanations live in the desktop Portfolio panel (invest-screen.tsx).
//   Invest v2 (josu): save in USD, MXN or Stocks. Inicio: one huge total (≈ US$, at the oracle rate), round actions,
//   three rows Dólares · Pesos · Acciones with each RETURN and a real-time interest counter (use-live-yield.ts:
//   exact for sOUSD, projected for the pool) · Producto · Actividad (real logs) · Perfil. T-bills are gone.
// Every action is a real on-chain transaction; guards (R-043/R-044) are kept exactly as api wrote them.
import { useState, type ReactNode } from "react";
import { useConnection } from "wagmi";
import { ArrowDownLeft, ArrowUpRight, Coins, DollarSign, ExternalLink, Home, Layers, List, TrendingUp, User } from "lucide-react";
import { explorerTx } from "@mercado/shared";
import { useBalances, useOracle } from "@/lib/contracts";
import { fmtAmount, shortAddr, toUnits } from "@/lib/format";
import { useReportBusy } from "@/lib/busy";
import { useNow } from "@/lib/use-now";
import { cn } from "@/lib/utils";
import { TickerText } from "@/lib/motion";
import { AppHeader, BalanceHead, BottomNav, BottomSheet, EmptyState, Meta, Money, NumericKeypad, ScreenTransition, Skeleton, SuccessScreen, fmtMoney, fmtTyping, useNavDirection } from "@/components/mobile";
import { LiveMoney } from "./live-money";
import { SXMXN, useLiveDollars, useLivePesos } from "./use-live-yield";
import { STOCKS_DEPLOYED, useStocks, useStocksActions, useStocksQuote } from "./use-stocks";
import { useVaultActions, useVaultPosition } from "./use-vault";
import {
  AccentField,
  ActionRow,
  BankRow,
  DayGroups,
  Display,
  Donut,
  Sparkline,
  EdApp,
  Flag,
  Pill,
  PillChip,
  RoundAction,
  SectionHead,
  hora,
  useH,
  LoadError,
  StaleLine,
  dayLabel,
  washStyle,
} from "@/components/mobile/extra/editorial";
import { INVEST, useInvestActions, useInvestHistory, useInvestPositions, type InvestActivity } from "./use-invest";

export const MAIZ = "#E5A823";
/** Stocks' slice in the allocation donut (Global's cobalt); dollars are ink, pesos maize. */
const COBALT = "#2448c8";

type Product = "dolares" | "pesos" | "acciones";
type Mode = "in" | "out";
type Tab = "inicio" | "actividad" | "perfil";
type View = { tab: Tab; product?: Product };
const TABS: Tab[] = ["inicio", "actividad", "perfil"];
type Done = { product: Product; mode: Mode; amount: bigint; symbol: string; hash?: string; url?: string };

const pct = (bps: bigint | number | undefined) => (bps === undefined ? "…" : `${(Number(bps) / 100).toFixed(2)}%`);
const px = (px8: bigint | undefined) => (px8 === undefined ? "…" : `US$${(Number(px8) / 1e8).toFixed(2)}`);
const signedPct = (x: number | undefined) => (x === undefined ? undefined : `${x > 0 ? "+" : x < 0 ? "−" : ""}${Math.abs(x).toFixed(2)}%`);
const busyLabel = (status: string) => (status === "simulating" ? "Preparando…" : status === "signing" ? "Firmando…" : "Confirmando en Tempo…");

/** Order = josu's: USD · MXN · Stocks. */
const ORDER: Product[] = ["dolares", "pesos", "acciones"];
const PRODUCT: Record<Product, { title: string; short: string; icon: typeof Coins; inLabel: string; outLabel: string; unit: string; currency: "USD" | "MXN" }> = {
  dolares: { title: "Dólares", short: "Dólares", icon: DollarSign, inLabel: "Depositar", outLabel: "Retirar", unit: "OUSD", currency: "USD" },
  pesos: { title: "Pesos", short: "Pesos", icon: Coins, inLabel: "Depositar", outLabel: "Retirar", unit: "xMXN", currency: "MXN" },
  acciones: { title: "Acciones", short: "Acciones", icon: TrendingUp, inLabel: "Comprar", outLabel: "Vender", unit: "mIDX", currency: "USD" },
};
/** Stocks = mIDX "Mercado US Equity Index" (demo token, owner price feed) on the Stocks desk (use-stocks.ts). */
const STOCKS_READY = STOCKS_DEPLOYED;
/** Pesos = the sxMXN savings vault (lead 03:32); "Pronto" until its address is in deployments. */
const PESOS_READY = !!SXMXN;
const ready = (id: Product) => (id === "dolares" ? true : id === "pesos" ? PESOS_READY : STOCKS_READY);

export function PhoneApp() {
  const [view, setView] = useState<View>({ tab: "inicio" });
  const [trade, setTrade] = useState<{ product: Product; mode: Mode }>();
  const [done, setDone] = useState<Done>();
  const key = done ? "done" : view.product ? `p-${view.product}` : view.tab;
  const prev = usePrevious(key);
  const tabDir = useNavDirection(view.tab, TABS);
  // into a product / the receipt slides forward, back out of them slides back, tab to tab slides along the nav order
  const dir = done || view.product ? "fwd" : prev === "done" || prev?.startsWith("p-") ? "back" : tabDir;
  return (
    <EdApp screen={key}>
      <ScreenTransition className="flex-1" id={key} dir={dir}>
        {done ? (
          <Listo done={done} close={() => setDone(undefined)} />
        ) : view.product ? (
          <ProductScreen product={view.product} back={() => setView({ tab: "inicio" })} trade={(mode) => setTrade({ product: view.product!, mode })} />
        ) : (
          <div className="flex-1">
            {view.tab === "inicio" && <Inicio open={(product) => setView({ tab: "inicio", product })} trade={(product, mode) => setTrade({ product, mode })} />}
            {view.tab === "actividad" && <Actividad />}
            {view.tab === "perfil" && <Perfil />}
          </div>
        )}
      </ScreenTransition>
      {/* outside ScreenTransition: its slide leaves a transform that would trap position:fixed on phones */}
      {!done && !view.product && (
        <BottomNav
          value={view.tab}
          onChange={(tab) => setView({ tab })}
          items={[
            { id: "inicio", label: "Inicio", icon: <Home strokeWidth={1.75} /> },
            { id: "actividad", label: "Actividad", icon: <List strokeWidth={1.75} /> },
            { id: "perfil", label: "Perfil", icon: <User strokeWidth={1.75} /> },
          ]}
        />
      )}
      <TradeSheet
        state={trade}
        setState={setTrade}
        onDone={(d) => {
          setTrade(undefined);
          setDone(d);
        }}
      />
    </EdApp>
  );
}

/** The previous distinct value of `v` (for the slide direction). */
function usePrevious(v: string) {
  const [hist, setHist] = useState<{ cur: string; prev?: string }>({ cur: v });
  if (hist.cur !== v) setHist({ cur: v, prev: hist.cur });
  return hist.cur === v ? hist.prev : hist.cur;
}

/** Kit AppHeader (■ 06 · INVEST); honesty sits beside the balance (BalanceHead) and in each screen's meta. */
function TopMeta({ title }: { title?: string }) {
  return <AppHeader index="06" product={title ? `Invest · ${title}` : "Invest"} />;
}

/* ─────────────────────────────── Inicio ─────────────────────────────── */

/** Return lines + live balances. Rates are the vaults' configured APRs, read on-chain; never "guaranteed". */
function useReturns() {
  const usd = useLiveDollars();
  const mxn = useLivePesos();
  const st = useStocks();
  const ch = signedPct(st.change);
  return {
    usd,
    mxn,
    st,
    line: {
      dolares: usd.aprBps !== undefined ? `${pct(usd.aprBps)} anual` : "…",
      pesos: !PESOS_READY ? "Pronto" : mxn.aprBps !== undefined ? `${pct(mxn.aprBps)} anual` : "…",
      acciones: !STOCKS_READY ? "Pronto" : [px(st.px8), ch && `${ch} ${st.change24h ? "hoy" : "total"}`].filter(Boolean).join(" · "),
    } as Record<Product, string>,
  };
}

/** Total in US$ (6dp): pesos at the oracle rate. */
function useTotals() {
  const p = useInvestPositions();
  const fx = useOracle();
  const pesos = useVaultPosition(SXMXN, INVEST.xmxn);
  const st = useStocks();
  const mxn = PESOS_READY ? pesos.withdrawable : 0n;
  const stocks = STOCKS_READY ? st.value : 0n;
  const pesosUsd = mxn !== undefined && fx.mxnPerUsd ? (mxn * 100_000_000n) / fx.mxnPerUsd : undefined;
  const total = pesosUsd !== undefined && p.dollars?.value !== undefined && stocks !== undefined ? pesosUsd + p.dollars.value + stocks : undefined;
  return { p, fx, total };
}

function Inicio({ open, trade }: { open: (p: Product) => void; trade: (p: Product, m: Mode) => void }) {
  const H = useH();
  const { fx, total } = useTotals();
  const r = useReturns();
  return (
    <div className="pb-6">
      {/* v5 maize field: header + the one big total (kit Money ticks to each new value) */}
      <AccentField color={MAIZ} className="pb-6">
        <TopMeta />
        <section className="px-5 pt-8" aria-live="polite">
          <BalanceHead label="Total invertido" />
          <Money value={total} currency="USD" size={50} className="mt-3" />
          <Meta className="mt-2" parts={[fx.rate ? `1 USD = ${fx.rate.toFixed(2)} MXN` : undefined, H("Pesos al tipo del oráculo demo"), H("No canjeable")]} />
        </section>
      </AccentField>
      <div style={washStyle(MAIZ)}>
        <div className="px-4 pt-7">
          <ActionRow>
            <RoundAction primary icon={<ArrowDownLeft strokeWidth={1.75} />} label="Ahorrar" onClick={() => trade("dolares", "in")} />
            <RoundAction icon={<ArrowUpRight strokeWidth={1.75} />} label="Retirar" onClick={() => trade("dolares", "out")} />
            <RoundAction icon={<TrendingUp strokeWidth={1.75} />} label="Acciones" onClick={() => trade("acciones", "in")} disabled={!STOCKS_READY} />
            <RoundAction icon={<Layers strokeWidth={1.75} />} label="Colateral" href="/mint" />
          </ActionRow>
        </div>
        <div className="px-5 pt-8">
          <SectionHead>Tu dinero</SectionHead>
          <Allocation r={r} rate={fx.rate} />
          {ORDER.map((id) => {
            const P = PRODUCT[id];
            const ok = ready(id);
            return (
              <BankRow
                key={id}
                onClick={ok ? () => open(id) : undefined}
                leading={
                  <span className="grid size-10 place-items-center rounded-full border border-[var(--m-on-surface)]">
                    {id === "dolares" ? <Flag code="us" className="h-[12px] w-[18px]" /> : id === "pesos" ? <Flag code="mx" className="h-[12px] w-[18px]" /> : <P.icon strokeWidth={1.75} />}
                  </span>
                }
                title={P.title}
                sub={<TickerText text={r.line[id]} />}
                amount={
                  !ok ? (
                    <span className="text-[var(--m-on-surface-variant)]">Pronto</span>
                  ) : id === "acciones" ? (
                    `US${fmtMoney(r.st.value)}`
                  ) : (
                    <LiveMoney live={id === "dolares" ? r.usd : r.mxn} currency={P.currency} glow />
                  )
                }
                amountSub={ok ? (id === "acciones" ? `${r.st.balance === undefined ? "—" : fmtAmount(r.st.balance, 4)} mIDX` : P.unit) : undefined}
              />
            );
          })}
          <Meta className="mt-3">{["Se acumula cada segundo en la cadena", H("de una reserva demo"), "Tasas configuradas, no garantizadas", H("Acciones: token demo, precio del administrador"), H("Testnet")].filter(Boolean).join(" · ")}</Meta>
        </div>
        <div className="px-5 pt-7">
          <SectionHead>Actividad</SectionHead>
          <ActivityList limit={3} />
        </div>
      </div>
    </div>
  );
}

/** v6: live allocation donut (US$, pesos at the oracle rate). Re-read every 10s with the chain reads, so it follows
 *  deposits, withdrawals and trades without creeping on the projected interest (lead 08:58 motion budget). */
function Allocation({ r, rate }: { r: ReturnType<typeof useReturns>; rate?: number }) {
  const now = useNow(10_000);
  const t = now ?? Date.now() / 1000;
  const usd = r.usd.at(t) ?? 0;
  const mxn = PESOS_READY && rate ? (r.mxn.at(t) ?? 0) / rate : 0;
  const stocks = STOCKS_READY && r.st.value !== undefined ? Number(r.st.value) / 1e6 : 0;
  const total = usd + mxn + stocks;
  const parts = [
    { key: "dolares" as const, value: usd, color: "var(--m-on-surface)" },
    { key: "pesos" as const, value: mxn, color: MAIZ },
    { key: "acciones" as const, value: stocks, color: COBALT },
  ];
  const share = (v: number) => (total > 0 ? Math.round((v / total) * 100) : 0);
  return (
    <div className="flex items-center gap-5 pt-4 pb-1">
      <Donut parts={parts} size={84} stroke={12} label={parts.map((p) => `${PRODUCT[p.key].title} ${share(p.value)}%`).join(", ")} />
      <ul className="grid min-w-0 flex-1 gap-1.5" aria-hidden>
        {parts.map((p) => (
          <li key={p.key} className="flex items-center gap-2 text-[14px]">
            <span className="size-2.5 shrink-0 rounded-[2px]" style={{ background: p.color }} />
            <span className="flex-1 font-medium">{PRODUCT[p.key].title}</span>
            <TickerText text={`${share(p.value)}%`} className="m-num text-[var(--m-on-surface-variant)]" />
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * v6 (review #5/#10): a product's NET CONTRIBUTIONS over its observed history, in its own unit (OUSD / xMXN /
 * mIDX): steps at each deposit/withdrawal/trade, starting at the first observed event (no invented zero) and
 * held flat to today. It is not a valuation; the live value is the number above it. A fixed 104px slot from first
 * paint: loading, failed, empty and one-event histories use the same box and say so.
 */
function ContributionChart({ product }: { product: Product }) {
  const h = useInvestHistory();
  const now = useNow(60_000);
  const unit = product === "acciones" ? "mIDX" : PRODUCT[product].unit;
  const title = product === "acciones" ? "mIDX comprados − vendidos" : `Aportes netos · ${unit}`;
  const digits = product === "acciones" ? 4 : 2;
  const fmt = (x: number) => x.toLocaleString("es-MX", { minimumFractionDigits: digits, maximumFractionDigits: digits });
  const rows = (h.data?.rows ?? [])
    // pesos: only the sxMXN savings rows (older lending-pool rows are another product)
    .filter((x) => x.product === product && x.timestamp !== undefined && (product === "acciones" || x.label.includes("ahorro")))
    .sort((a, b) => a.timestamp! - b.timestamp!);
  let v = 0;
  const pts = rows.map((x) => {
    const into = x.label.startsWith("Depósito") || x.label.startsWith("Compra");
    v += (into ? 1 : -1) * (Number(x.amount) / 1e6);
    return { t: x.timestamp!, v };
  });
  const n = pts.length;
  const vals = pts.map((x) => x.v);
  const [min, max] = [Math.min(...vals), Math.max(...vals)];
  const first = n ? dayLabel(pts[0].t, now) : undefined;
  const series = n >= 2 ? [...pts, { t: Math.max(now ?? 0, pts.at(-1)!.t), v: pts.at(-1)!.v }] : [];
  const status = !h.data
    ? h.isError
      ? "Historial no disponible"
      : "Cargando historial…"
    : n === 0
      ? "Sin aportes todavía"
      : n === 1
        ? `Historial corto · un movimiento (${first})`
        : undefined;
  return (
    <figure className="mt-5 grid h-[104px] grid-rows-[32px_1fr_16px] gap-1">
      {/* two fixed lines: what is plotted, then its range */}
      <figcaption className="m-meta grid content-start">
        <span className="truncate">{title}</span>
        <span>{n >= 2 ? `máx ${fmt(max)} · mín ${fmt(min)}` : " "}</span>
      </figcaption>
      <div className="relative min-h-0">
        {series.length ? (
          <Sparkline
            points={series}
            height={44}
            label={`${title}, desde ${first} hasta hoy, mínimo ${fmt(min)}, máximo ${fmt(max)}`}
            color="#0a0a0a"
            fill="#ffffff"
            fillOpacity={0.32}
          />
        ) : (
          // a still scaffold (never a fake trend) in the same box
          <span aria-hidden className="absolute inset-x-0 top-1/2 border-t border-dashed border-[rgba(10,10,10,.35)]" />
        )}
      </div>
      <p className="m-meta flex justify-between gap-2" role={status ? "status" : undefined}>
        {status ? (
          <span>{status}</span>
        ) : (
          <>
            <span>{first}</span>
            <span>Hoy</span>
          </>
        )}
      </p>
    </figure>
  );
}

/* ─────────────────────────────── Product ─────────────────────────────── */

function ProductScreen({ product, back, trade }: { product: Product; back: () => void; trade: (m: Mode) => void }) {
  const H = useH();
  const p = useInvestPositions();
  const pesos = useVaultPosition(SXMXN, INVEST.xmxn);
  const r = useReturns();
  const P = PRODUCT[product];
  const view = {
    dolares: {
      live: r.usd,
      meta: ["OUSD", r.line.dolares, H("Fondeado por admin")],
      facts: [
        { k: "Retirable ahora", v: `US${fmtMoney(p.dollars?.value)}` },
        { k: "Reserva de rendimiento", v: `US${fmtMoney(p.dollars?.yieldReserve, 0)}` },
        { k: "Fuente", v: "Reserva demo" },
      ],
      note: ["Se acumula cada segundo en la cadena", H("Tasa configurada por el admin"), "No garantizada"],
    },
    pesos: {
      live: r.mxn,
      meta: ["xMXN", r.line.pesos, H("Fondeado por admin"), H("No canjeable")],
      facts: [
        { k: "Retirable ahora", v: `MX${fmtMoney(pesos.withdrawable)}` },
        { k: "Reserva de rendimiento", v: `MX${fmtMoney(pesos.yieldReserve, 0)}` },
        { k: "Fuente", v: "Reserva demo" },
      ],
      note: ["Se acumula cada segundo en la cadena", H("Tasa configurada por el admin"), "No garantizada"],
    },
    acciones: {
      live: undefined,
      meta: ["mIDX", r.line.acciones, H("Token demo, no es un valor")],
      facts: [
        { k: "Tienes", v: `${r.st.balance === undefined ? "—" : fmtAmount(r.st.balance, 4)} mIDX` },
        { k: "Puedes vender", v: `${r.st.sellable === undefined ? "—" : fmtAmount(r.st.sellable, 4)} mIDX` },
        { k: "Spread", v: pct(r.st.spreadBps) },
        { k: "Mesa", v: r.st.closed ? "En pausa" : "Abierta" },
      ],
      note: ["Mercado US Equity Index", H("token demo con precio del administrador"), "Solo recompra lo que compraste aquí", "Sirve como colateral en Mint"],
    },
  }[product];
  const ok = ready(product);
  return (
    <div className="flex flex-1 flex-col pb-6">
      <AccentField color={MAIZ} className="pb-6">
        <div className="flex items-center gap-2 px-2 pt-2">
          <button type="button" onClick={back} className="m-press grid size-12 place-items-center rounded-full" aria-label="Atrás">
            <ArrowUpRight className="size-5 -rotate-[135deg]" strokeWidth={2} />
          </button>
          <Meta mark="#0a0a0a" parts={["06", "Invest", P.short]} className="text-[var(--m-on-surface)]" />
        </div>
        <section className="px-5 pt-4">
          <Display size={44} fit>
            {P.title}
          </Display>
          <div className="mt-6">
            <BalanceHead label="Tienes" />
          </div>
          {view.live && ok ? (
            <LiveMoney live={view.live} currency={P.currency} variant="hero" size={50} className="mt-3" glow />
          ) : (
            <Money value={product === "acciones" && ok ? r.st.value : undefined} currency="USD" size={50} className="mt-3" />
          )}
          <Meta className="mt-2" parts={view.meta} />
          {/* v6: net contributions over the observed history, fixed slot (review #5/#10) */}
          <ContributionChart product={product} />
        </section>
      </AccentField>
      <div className="flex flex-1 flex-col" style={washStyle(MAIZ)}>
        <div className="grid grid-cols-2 gap-3 px-5 pt-6">
          <Pill accent onClick={() => trade("in")} disabled={!ok || (product === "acciones" && r.st.closed)}>
            {P.inLabel}
          </Pill>
          <Pill variant="line" onClick={() => trade("out")} disabled={!ok || (product === "acciones" && r.st.closed)}>
            {P.outLabel}
          </Pill>
        </div>
        {view.facts.length > 0 && (
          <dl className="mx-5 mt-7 border-t border-[var(--m-on-surface)]">
            {view.facts.map((f) => (
              <div key={f.k} className="flex min-h-12 items-center justify-between gap-3 border-b border-[var(--m-outline-variant)]">
                <dt className="text-[14px] text-[var(--m-on-surface-variant)]">{f.k}</dt>
                <dd className="m-num text-right text-[15px] font-semibold">{f.v}</dd>
              </div>
            ))}
          </dl>
        )}
        {/* plain Meta (children) so long notes wrap; parts stay on one line each */}
        <Meta className="px-5 pt-3">{view.note.filter(Boolean).join(" · ")}</Meta>
        <div className="px-5 pt-7">
          <SectionHead>Movimientos</SectionHead>
          <ActivityList product={product} limit={5} />
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────── Trade sheet ─────────────────────────────── */

function TradeSheet({ state, setState, onDone }: { state?: { product: Product; mode: Mode }; setState: (s?: { product: Product; mode: Mode }) => void; onDone: (d: Done) => void }) {
  const H = useH();
  const p = useInvestPositions();
  const bal = useBalances();
  const act = useInvestActions();
  const vact = useVaultActions(SXMXN, INVEST.xmxn, "xMXN");
  const vpos = useVaultPosition(SXMXN, INVEST.xmxn);
  const sact = useStocksActions();
  const st = useStocks();
  const [amount, setAmount] = useState("");
  const product = state?.product ?? "dolares";
  const mode = state?.mode ?? "in";
  const P = PRODUCT[product];
  const amt = toUnits(amount || "0");
  const tx = product === "pesos" ? vact.tx : product === "acciones" ? sact.tx : act.tx;
  useReportBusy(act.tx.isBusy || vact.tx.isBusy || sact.tx.isBusy);
  const quote = useStocksQuote(mode === "in" ? "buy" : "sell", product === "acciones" ? amt : 0n);
  const busy = act.tx.isBusy || vact.tx.isBusy || sact.tx.isBusy;

  const cfg = {
    pesos: {
      sym: "xMXN",
      wallet: vpos.wallet,
      maxOut: vpos.withdrawable, // sxMXN maxWithdraw
      run: () => (mode === "in" ? vact.deposit(amt) : vact.withdraw(amt)),
    },
    dolares: {
      sym: "OUSD",
      wallet: bal.ousd,
      maxOut: p.dollars?.value,
      run: () => (mode === "in" ? act.depositDolares(amt) : act.withdrawDolares(amt)),
    },
    acciones: {
      sym: mode === "in" ? "OUSD" : "mIDX",
      wallet: bal.ousd,
      // Sellable = what you hold AND bought at this desk (buy-back is personal, non-transferable).
      maxOut: st.sellable,
      run: () => (quote.out === undefined ? undefined : mode === "in" ? sact.buy(amt, quote.out) : sact.sell(amt, quote.out)),
    },
  }[product];
  const limit = mode === "in" ? cfg.wallet : cfg.maxOut;
  const over = limit !== undefined && amt > limit;
  // R-043: a paused desk still quotes, but trades revert; treat it (or unknown) as closed.
  const closed = !ready(product) || (product === "acciones" && st.closed);
  const needsQuote = product === "acciones";
  const disabled = amt === 0n || over || busy || closed || (needsQuote && quote.out === undefined);
  const limitDigits = product === "acciones" && mode === "out" ? 4 : 2;

  const reset = (next: { product: Product; mode: Mode }) => {
    if (busy) return;
    setAmount("");
    tx.reset();
    setState(next);
  };

  return (
    <BottomSheet
      ariaLabel={`${mode === "in" ? P.inLabel : P.outLabel} · ${P.title}`}
      open={!!state}
      onClose={() => {
        if (busy) return;
        setAmount("");
        tx.reset();
        setState(undefined);
      }}
      dismissable={!busy}
    >
      <div className="grid gap-4 px-6 pb-2">
        <div className="flex gap-2">
          {ORDER.map((id) => (
            <PillChip key={id} selected={product === id} disabled={busy || !ready(id)} onClick={() => reset({ product: id, mode })}>
              {PRODUCT[id].short}
            </PillChip>
          ))}
        </div>
        <div role="tablist" aria-label="Operación" className="grid grid-cols-2 border-b border-[var(--m-outline-variant)]">
          {(["in", "out"] as const).map((md) => (
            <button
              key={md}
              type="button"
              role="tab"
              disabled={busy}
              onClick={() => reset({ product, mode: md })}
              aria-selected={mode === md}
              className={cn("-mb-px h-11 border-b-2 text-[15px] font-semibold", mode === md ? "border-[var(--m-on-surface)]" : "border-transparent text-[var(--m-on-surface-variant)]")}
            >
              {md === "in" ? P.inLabel : P.outLabel}
            </button>
          ))}
        </div>
        <div className="text-center">
          <p className="m-display m-num text-[46px]" aria-live="polite">
            {fmtTyping(amount)} <span className="font-[family-name:var(--font-phone)] text-[16px] font-semibold tracking-normal normal-case">{cfg.sym}</span>
          </p>
          <p className={cn("m-meta mt-2", over && "!text-[var(--m-error)]")}>
            {over ? "Excede el máximo" : mode === "in" ? "Disponible" : "Máximo"} · {limit === undefined ? "—" : fmtAmount(limit, limitDigits)} {cfg.sym}
          </p>
          {closed && <p className="m-meta mt-1">{product === "acciones" && STOCKS_READY ? "Mesa en pausa · sin operaciones" : `${P.title}: pronto`}</p>}
          {needsQuote && amt > 0n && !closed && (
            <p className="m-meta mt-1">
              {quote.out === undefined
                ? quote.error
                  ? "Sin cotización · inventario o precio"
                  : "Cotizando…"
                : mode === "in"
                  ? `Recibes ≈ ${fmtAmount(quote.out, 4)} mIDX · spread incl.`
                  : `Recibes ≈ ${fmtAmount(quote.out)} OUSD · spread incl.`}
            </p>
          )}
        </div>
        <NumericKeypad value={amount} onChange={setAmount} disabled={busy} />
        {tx.status === "error" && tx.error && (
          <p role="alert" className="text-[14px] font-medium text-[var(--m-error)]">
            {tx.error}
          </p>
        )}
        <Pill
          accent
          loading={busy}
          disabled={disabled}
          onClick={async () => {
            const steps = await cfg.run();
            if (steps) {
              const last = steps.at(-1);
              const bought = product === "acciones" && mode === "in";
              onDone({ product, mode, amount: bought && quote.out !== undefined ? quote.out : amt, symbol: bought ? "mIDX" : cfg.sym, hash: last?.hash, url: last?.url });
              setAmount("");
              tx.reset();
            }
          }}
        >
          {busy ? busyLabel(tx.status) : mode === "in" ? P.inLabel : P.outLabel}
        </Pill>
        <Meta className="justify-center">{["Transacción real en Tempo", H("Testnet · sin valor real")].filter(Boolean).join(" · ")}</Meta>
      </div>
    </BottomSheet>
  );
}

/* ─────────────────────────────── Success ─────────────────────────────── */

function Listo({ done, close }: { done: Done; close: () => void }) {
  const H = useH();
  const P = PRODUCT[done.product];
  const verb = done.mode === "in" ? (done.product === "acciones" ? "Comprado." : "Depositado.") : done.product === "acciones" ? "Vendido." : "Retirado.";
  const digits = done.symbol === "mIDX" ? 4 : 2;
  // kit SuccessScreen paints the amount in the accent; maize on white is 2.1:1, so it stays ink here.
  return (
    <div className="flex flex-1 flex-col [&>div]:flex-1">
      <SuccessScreen
        title={verb}
        amount={
          <span className="text-[var(--m-on-surface)]">
            {done.product === "acciones" && done.mode === "in" ? "≈ " : ""}
            {fmtAmount(done.amount, digits)} <span className="font-[family-name:var(--font-phone)] text-[16px] font-semibold tracking-normal normal-case">{done.symbol}</span>
          </span>
        }
        caption={[P.title, "Confirmado en Tempo", H("Testnet · sin valor real")].filter(Boolean).join(" · ")}
        action={<Pill onClick={close}>Listo</Pill>}
      >
        <dl className="border-t border-[var(--m-on-surface)]">
          <div className="flex min-h-12 items-center justify-between gap-3 border-b border-[var(--m-outline-variant)]">
            <dt className="text-[14px] text-[var(--m-on-surface-variant)]">Comprobante</dt>
            <dd>
              {done.url ? (
                <a href={done.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-mono text-[13px] underline underline-offset-4">
                  {done.hash?.slice(0, 10)}… <ExternalLink className="size-3.5" />
                </a>
              ) : (
                "—"
              )}
            </dd>
          </div>
        </dl>
      </SuccessScreen>
    </div>
  );
}

/* ─────────────────────────────── Actividad ─────────────────────────────── */

const ROW_LABEL: Record<string, string> = {
  "Depósito · ahorro en pesos": "Depósito en pesos",
  "Retiro · ahorro en pesos": "Retiro de pesos",
  "Depósito · ahorro en dólares": "Depósito en dólares",
  "Retiro · ahorro en dólares": "Retiro de dólares",
  "Compra · acciones": "Compra de acciones",
  "Venta · acciones": "Venta de acciones",
};
type Row = Omit<InvestActivity, "product"> & { product: Product };

function ActivityList({ limit, product }: { limit?: number; product?: Product }) {
  const { address } = useConnection();
  const h = useInvestHistory();
  const now = useNow(60_000);
  // T-bills are gone from the product (legacy trades are hidden); Stocks trades arrive as product "acciones".
  const all: Row[] = (h.data?.rows ?? []).flatMap((r) => (r.product === "tbills" ? [] : [{ ...r, product: r.product }]));
  const rows = all.filter((r) => !product || r.product === product).slice(0, limit ?? 30);
  if (!address) return <p className="py-5 text-[14px] text-[var(--m-on-surface-variant)]">Conecta tu cuenta para ver tus movimientos.</p>;
  if (!h.data && h.isError) return <LoadError onRetry={() => h.refetch()} busy={h.isFetching} />;
  if (!h.data)
    return (
      <div className="grid gap-3 pt-3" aria-busy="true">
        {[0, 1].map((i) => (
          <div key={i} className="flex items-center gap-3">
            <Skeleton className="size-10 rounded-full" />
            <Skeleton className="h-4 flex-1 rounded-[2px]" />
          </div>
        ))}
      </div>
    );
  if (!rows.length) return <EmptyState icon={<Coins strokeWidth={1.5} />} title="Sin movimientos todavía." />;
  return (
    <>
      {h.isRefetchError && <StaleLine updatedAt={h.dataUpdatedAt} now={now} onRetry={() => h.refetch()} />}
    <DayGroups
      items={rows}
      ts={(r: Row) => r.timestamp}
      now={now}
      render={(r) => {
        const into = r.label.startsWith("Depósito") || r.label.startsWith("Compra");
        const P = PRODUCT[r.product];
        return (
          <BankRow
            key={`${r.txHash}-${r.logIndex}`}
            href={explorerTx(r.txHash)}
            leading={
              <span
                className={cn("grid size-10 place-items-center rounded-full", into ? "text-[#0a0a0a]" : "border border-[var(--m-on-surface)]")}
                style={into ? { background: MAIZ } : undefined}
              >
                <P.icon strokeWidth={1.75} />
              </span>
            }
            title={ROW_LABEL[r.label] ?? r.label}
            sub={[hora(r.timestamp), "On-chain"].filter(Boolean).join(" · ")}
            amount={`${into ? "+" : "−"}${fmtAmount(r.amount, r.symbol === "mIDX" ? 4 : 2)}`}
            amountSub={r.symbol}
          />
        );
      }}
    />
    </>
  );
}

function Actividad() {
  return (
    <div className="pb-6">
      <AccentField color={MAIZ} className="pb-6">
        <TopMeta title="Actividad" />
        <div className="px-5 pt-6">
          <Display size={40}>Actividad</Display>
          <Meta className="mt-2" parts={["Depósitos y retiros", "On-chain · Tempo testnet"]} />
        </div>
      </AccentField>
      <div className="px-5 pt-3" style={washStyle(MAIZ)}>
        <ActivityList />
      </div>
    </div>
  );
}

/* ─────────────────────────────── Perfil ─────────────────────────────── */

function Perfil() {
  const H = useH();
  const { address } = useConnection();
  const bal = useBalances();
  const rows: { k: string; v: ReactNode }[] = [
    { k: "Wallet", v: <span className="font-mono text-[13px]">{shortAddr(address)}</span> },
    { k: "OUSD disponible", v: fmtMoney(bal.ousd) },
    { k: "xMXN disponible", v: fmtMoney(bal.xmxn) },
    { k: "Red", v: "Tempo testnet" },
  ];
  return (
    <div className="pb-6">
      <AccentField color={MAIZ} className="pb-6">
        <TopMeta title="Perfil" />
        <div className="px-5 pt-6">
          <Display size={44} fit>Ahorrador</Display>
          <Meta className="mt-2" parts={[H("Cuenta demo"), H("Tempo testnet")]} />
        </div>
      </AccentField>
      <div className="px-5 pt-6" style={washStyle(MAIZ)}>
        <dl className="border-t border-[var(--m-on-surface)]">
          {rows.map((r) => (
            <div key={r.k} className="flex min-h-14 items-center justify-between gap-3 border-b border-[var(--m-outline-variant)]">
              <dt className="text-[14px] text-[var(--m-on-surface-variant)]">{r.k}</dt>
              <dd className="m-num text-[15px] font-medium">{r.v}</dd>
            </div>
          ))}
        </dl>
        <div data-honesty>
          <Meta className="mt-6">{"OUSD y xMXN: tokens de testnet, sin valor ni respaldo, no canjeables · Rendimientos no garantizados · Dólares y pesos: APR configurado por el admin, reserva demo · Acciones: token demo, no es un valor, precio del administrador"}</Meta>
        </div>
      </div>
    </div>
  );
}
