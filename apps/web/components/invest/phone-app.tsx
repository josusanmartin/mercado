"use client";
// Mercado Invest phone app (crew/DESIGN-ECOSYSTEM.md §7, restyled per crew/PRINCIPLES.md on the mobile.md v2
// fintech structure; owned by mobile2, data + actions by api in use-invest.ts). Spanish only inside the phone;
// the longer "where the yield comes from" explanations live in the desktop Portfolio panel (invest-screen.tsx).
//   Inicio: one huge total (≈ US$, at the oracle rate), USD/MXN split, round actions, the three products as
//   bank rows · Producto: position + facts + Depositar/Retirar (Comprar/Vender) · Actividad (real logs) · Perfil.
// Every action is a real on-chain transaction; guards (R-043/R-044) are kept exactly as api wrote them.
import { useState, type CSSProperties, type ReactNode } from "react";
import { useConnection } from "wagmi";
import { ArrowDownLeft, ArrowUpRight, Coins, DollarSign, ExternalLink, Home, Landmark, Layers, List, User } from "lucide-react";
import { explorerTx } from "@mercado/shared";
import { useBalances, useOracle } from "@/lib/contracts";
import { fmtAmount, shortAddr, toUnits } from "@/lib/format";
import { useReportBusy } from "@/lib/busy";
import { useNow } from "@/lib/use-now";
import { cn } from "@/lib/utils";
import { BottomSheet, NumericKeypad, ScreenTransition, Skeleton, SuccessCheck, fmtMoney, fmtTyping } from "@/components/mobile";
import {
  ActionRow,
  BankRow,
  BigMoney,
  DayGroups,
  Display,
  DotNav,
  EdApp,
  Flag,
  Meta,
  Pill,
  PillChip,
  RoundAction,
  SectionHead,
  SplitStats,
  edClass,
  hora,
} from "@/components/mobile/extra/editorial";
import { INVEST, useInvestActions, useInvestHistory, useInvestPositions, useTbillQuote, type InvestActivity } from "./use-invest";

export const MAIZ = "#E5A823";
/** Ink on maize (PRINCIPLES: Invest gold carries ink text). */
const ON_MAIZ = { "--m-on-accent": "#0a0a0a" } as CSSProperties;

type Product = "pesos" | "dolares" | "tbills";
type Mode = "in" | "out";
type Tab = "inicio" | "actividad" | "perfil";
type View = { tab: Tab; product?: Product };
type Done = { product: Product; mode: Mode; amount: bigint; symbol: string; hash?: string; url?: string };

const pct = (bps: bigint | undefined) => (bps === undefined ? "…" : `${(Number(bps) / 100).toFixed(2)}%`);
const px = (px8: bigint | undefined) => (px8 === undefined ? "…" : `$${(Number(px8) / 1e8).toFixed(2)}`);
const busyLabel = (status: string) => (status === "simulating" ? "Preparando…" : status === "signing" ? "Firmando…" : "Confirmando en Tempo…");

const PRODUCT: Record<Product, { title: string; short: string; icon: typeof Coins; inLabel: string; outLabel: string; unit: string; digits: number }> = {
  pesos: { title: "Ahorro en pesos", short: "Pesos", icon: Coins, inLabel: "Depositar", outLabel: "Retirar", unit: "xMXN", digits: 2 },
  dolares: { title: "Ahorro en dólares", short: "Dólares", icon: DollarSign, inLabel: "Depositar", outLabel: "Retirar", unit: "OUSD", digits: 2 },
  tbills: { title: "T-bills", short: "T-bills", icon: Landmark, inLabel: "Comprar", outLabel: "Vender", unit: "tTBILL", digits: 4 },
};

export function PhoneApp() {
  const [view, setView] = useState<View>({ tab: "inicio" });
  const [trade, setTrade] = useState<{ product: Product; mode: Mode }>();
  const [done, setDone] = useState<Done>();
  const key = done ? "done" : view.product ? `p-${view.product}` : view.tab;
  return (
    <EdApp style={ON_MAIZ} screen={key}>
      <ScreenTransition className="flex-1" id={key} dir={done || view.product ? "fwd" : "fade"}>
        {done ? (
          <Listo done={done} close={() => setDone(undefined)} />
        ) : view.product ? (
          <ProductScreen product={view.product} back={() => setView({ tab: "inicio" })} trade={(mode) => setTrade({ product: view.product!, mode })} />
        ) : (
          <div className="flex flex-1 flex-col">
            <div className="flex-1">
              {view.tab === "inicio" && <Inicio open={(product) => setView({ tab: "inicio", product })} trade={(product, mode) => setTrade({ product, mode })} />}
              {view.tab === "actividad" && <Actividad />}
              {view.tab === "perfil" && <Perfil />}
            </div>
            <DotNav
              value={view.tab}
              onChange={(tab) => setView({ tab })}
              items={[
                { id: "inicio", label: "Inicio", icon: <Home strokeWidth={1.75} /> },
                { id: "actividad", label: "Actividad", icon: <List strokeWidth={1.75} /> },
                { id: "perfil", label: "Perfil", icon: <User strokeWidth={1.75} /> },
              ]}
            />
          </div>
        )}
      </ScreenTransition>
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

function TopMeta({ title }: { title: string }) {
  return (
    <div className="px-5 pt-4">
      <Meta mark={MAIZ} parts={[title, "Testnet · sin valor real"]} />
    </div>
  );
}

/* ─────────────────────────────── Inicio ─────────────────────────────── */

/** Positions in OUSD-equivalent (6dp): pesos at the oracle rate, T-bills at the admin feed. */
function useTotals() {
  const p = useInvestPositions();
  const fx = useOracle();
  const pesosUsd = p.pesos.balance !== undefined && fx.mxnPerUsd ? (p.pesos.balance * 100_000_000n) / fx.mxnPerUsd : undefined;
  const usdSide = p.dollars?.value !== undefined && p.tbill?.value !== undefined ? p.dollars.value + p.tbill.value : undefined;
  const total = pesosUsd !== undefined && usdSide !== undefined ? pesosUsd + usdSide : undefined;
  return { p, fx, pesosUsd, usdSide, total };
}

function Inicio({ open, trade }: { open: (p: Product) => void; trade: (p: Product, m: Mode) => void }) {
  const { p, fx, usdSide, total } = useTotals();
  const deskOpen = !!INVEST.desk && p.desk?.paused === false;
  const rows: { id: Product; sub: string; value: string; unit: string }[] = [
    { id: "pesos", sub: "Variable · financia choferes", value: fmtMoney(p.pesos.balance), unit: "xMXN" },
    { id: "dolares", sub: `APR demo ${pct(p.dollars?.aprBps)} · sOUSD`, value: fmtMoney(p.dollars?.value), unit: "OUSD" },
    { id: "tbills", sub: `Precio ${px(p.tbill?.px8)} · feed admin`, value: p.tbill?.balance === undefined ? "—" : fmtAmount(p.tbill.balance, 4), unit: "tTBILL" },
  ];
  return (
    <div className="pb-6">
      <TopMeta title="Invest" />
      <section className="px-5 pt-8" aria-live="polite">
        <p className="m-meta">Total invertido</p>
        <BigMoney value={total} prefix="US$" size={50} className="mt-2" />
        <Meta className="mt-2" parts={[fx.rate ? `1 USD = ${fx.rate.toFixed(2)} MXN` : undefined, "Pesos al tipo del oráculo demo"]} />
      </section>
      <div className="px-4 pt-7">
        <ActionRow>
          <RoundAction primary icon={<ArrowDownLeft strokeWidth={1.75} />} label="Ahorrar" onClick={() => trade("pesos", "in")} />
          <RoundAction icon={<ArrowUpRight strokeWidth={1.75} />} label="Retirar" onClick={() => trade("pesos", "out")} />
          <RoundAction icon={<Landmark strokeWidth={1.75} />} label="T-bills" onClick={() => trade("tbills", "in")} disabled={!deskOpen} />
          <RoundAction icon={<Layers strokeWidth={1.75} />} label="Colateral" href="/mint" />
        </ActionRow>
      </div>
      <div className="px-5 pt-7">
        <SplitStats
          items={[
            { label: <><Flag code="us" /> Dólares</>, value: fmtMoney(usdSide), sub: "OUSD + T-bills" },
            { label: <><Flag code="mx" /> Pesos</>, value: fmtMoney(p.pesos.balance), sub: "xMXN en ahorro" },
          ]}
        />
      </div>
      <div className="px-5 pt-7">
        <SectionHead>Tus productos</SectionHead>
        {rows.map((r) => {
          const P = PRODUCT[r.id];
          return (
            <BankRow
              key={r.id}
              onClick={() => open(r.id)}
              leading={
                <span className="grid size-10 place-items-center rounded-full border border-[var(--m-on-surface)]">
                  <P.icon strokeWidth={1.75} />
                </span>
              }
              title={P.title}
              sub={r.sub}
              amount={r.value}
              amountSub={r.unit}
            />
          );
        })}
      </div>
      <div className="px-5 pt-7">
        <SectionHead>Actividad</SectionHead>
        <ActivityList limit={3} />
      </div>
    </div>
  );
}

/* ─────────────────────────────── Product ─────────────────────────────── */

function ProductScreen({ product, back, trade }: { product: Product; back: () => void; trade: (m: Mode) => void }) {
  const p = useInvestPositions();
  const P = PRODUCT[product];
  const deskClosed = product === "tbills" && (!INVEST.desk || p.desk?.paused !== false);
  const sellable = p.tbill?.balance !== undefined && p.desk?.sellable !== undefined ? (p.tbill.balance < p.desk.sellable ? p.tbill.balance : p.desk.sellable) : undefined;
  const view = {
    pesos: {
      position: p.pesos.balance,
      meta: ["Variable", "No garantizado"],
      facts: [
        { k: "Retirable ahora", v: `${fmtMoney(p.pesos.withdrawable)} xMXN` },
        { k: "Efectivo libre del pool", v: `${fmtMoney(p.pesos.poolCash, 0)} xMXN` },
        { k: "Comisiones repartidas", v: `${fmtMoney(p.pesos.realizedFees)} xMXN` },
        { k: "Fuente", v: "Comisiones de choferes" },
      ],
      note: ["Lo prestado no se retira hasta que lo paguen"],
    },
    dolares: {
      position: p.dollars?.value,
      meta: [`APR demo ${pct(p.dollars?.aprBps)}`, "Fondeado por admin"],
      facts: [
        { k: "Retirable ahora", v: `${fmtMoney(p.dollars?.value)} OUSD` },
        { k: "Reserva de rendimiento", v: `${fmtMoney(p.dollars?.yieldReserve, 0)} OUSD` },
        { k: "Fuente", v: "Reserva demo" },
      ],
      note: ["Rendimiento demo de testnet"],
    },
    tbills: {
      position: p.tbill?.balance,
      meta: [`Precio ${px(p.tbill?.px8)}`, `Spread ${pct(p.desk?.spreadBps)}`],
      facts: [
        { k: "Valor", v: `${fmtMoney(p.tbill?.value)} OUSD` },
        { k: "Puedes vender", v: `${sellable === undefined ? "—" : fmtAmount(sellable, 4)} tTBILL` },
        { k: "Inventario del desk", v: `${p.desk?.reserveTbill === undefined ? "—" : fmtAmount(p.desk.reserveTbill, 2)} tTBILL` },
        { k: "Desk", v: p.desk?.paused === undefined ? "—" : p.desk.paused ? "En pausa" : "Abierto" },
      ],
      note: ["Token demo, no es un valor", "Solo recompra lo que compraste aquí", "Sirve como colateral en Mint"],
    },
  }[product];
  return (
    <div className="flex flex-1 flex-col pb-6">
      <div className="flex items-center gap-2 px-2 pt-2">
        <button type="button" onClick={back} className="m-press grid size-12 place-items-center rounded-full" aria-label="Atrás">
          <ArrowUpRight className="size-5 -rotate-[135deg]" strokeWidth={2} />
        </button>
        <Meta mark={MAIZ} parts={["Invest", P.short, "Testnet"]} />
      </div>
      <section className="px-5 pt-4">
        <Display size={40}>{P.title}</Display>
        <p className="m-meta mt-6">Tienes</p>
        {product === "tbills" ? (
          <BigMoney value={view.position} prefix="" digits={4} unit="tTBILL" size={46} className="mt-2" />
        ) : (
          <BigMoney value={view.position} unit={P.unit} size={50} className="mt-2" />
        )}
        <Meta className="mt-2" parts={view.meta} />
      </section>
      <div className="grid grid-cols-2 gap-3 px-5 pt-6">
        <Pill accent onClick={() => trade("in")} disabled={deskClosed}>
          {P.inLabel}
        </Pill>
        <Pill variant="line" onClick={() => trade("out")} disabled={deskClosed}>
          {P.outLabel}
        </Pill>
      </div>
      {deskClosed && <Meta className="px-5 pt-2" parts={["Desk en pausa · sin operaciones"]} />}
      <dl className="mx-5 mt-7 border-t border-[var(--m-on-surface)]">
        {view.facts.map((f) => (
          <div key={f.k} className="flex min-h-12 items-center justify-between gap-3 border-b border-[var(--m-outline-variant)]">
            <dt className="text-[14px] text-[var(--m-on-surface-variant)]">{f.k}</dt>
            <dd className="m-num text-right text-[15px] font-semibold">{f.v}</dd>
          </div>
        ))}
      </dl>
      <Meta className="px-5 pt-3" parts={view.note} />
      <div className="px-5 pt-7">
        <SectionHead>Movimientos</SectionHead>
        <ActivityList product={product} limit={5} />
      </div>
    </div>
  );
}

/* ─────────────────────────────── Trade sheet ─────────────────────────────── */

function TradeSheet({ state, setState, onDone }: { state?: { product: Product; mode: Mode }; setState: (s?: { product: Product; mode: Mode }) => void; onDone: (d: Done) => void }) {
  const p = useInvestPositions();
  const bal = useBalances();
  const act = useInvestActions();
  const [amount, setAmount] = useState("");
  const product = state?.product ?? "pesos";
  const mode = state?.mode ?? "in";
  const P = PRODUCT[product];
  const amt = toUnits(amount || "0");
  useReportBusy(act.tx.isBusy);
  const quote = useTbillQuote(mode === "in" ? "buy" : "sell", product === "tbills" ? amt : 0n);
  const busy = act.tx.isBusy;

  const cfg = {
    pesos: {
      sym: "xMXN",
      wallet: bal.xmxn,
      maxOut: p.pesos.withdrawable, // R-044: min(own claim, idle pool cash)
      run: () => (mode === "in" ? act.depositPesos(amt) : act.withdrawPesos(amt)),
    },
    dolares: {
      sym: "OUSD",
      wallet: bal.ousd,
      maxOut: p.dollars?.value,
      run: () => (mode === "in" ? act.depositDolares(amt) : act.withdrawDolares(amt)),
    },
    tbills: {
      sym: mode === "in" ? "OUSD" : "tTBILL",
      wallet: bal.ousd,
      // Sellable = what you hold AND bought at this desk (buy-back is personal, non-transferable).
      maxOut:
        p.tbill?.balance !== undefined && p.desk?.sellable !== undefined ? (p.tbill.balance < p.desk.sellable ? p.tbill.balance : p.desk.sellable) : undefined,
      run: () => (quote.out === undefined ? undefined : mode === "in" ? act.buyTbill(amt, quote.out) : act.sellTbill(amt, quote.out)),
    },
  }[product];
  const limit = mode === "in" ? cfg.wallet : cfg.maxOut;
  const over = limit !== undefined && amt > limit;
  const needsQuote = product === "tbills";
  // R-043: a paused desk still returns positive quotes, but trades revert; treat it (or unknown) as closed.
  const deskClosed = product === "tbills" && (!INVEST.desk || p.desk?.paused !== false);
  const disabled = amt === 0n || over || busy || (needsQuote && quote.out === undefined) || deskClosed;
  const limitDigits = product === "tbills" && mode === "out" ? 4 : 2;

  const reset = (next: { product: Product; mode: Mode }) => {
    if (busy) return;
    setAmount("");
    act.tx.reset();
    setState(next);
  };

  return (
    <BottomSheet
      open={!!state}
      onClose={() => {
        if (busy) return;
        setAmount("");
        act.tx.reset();
        setState(undefined);
      }}
      dismissable={!busy}
    >
      <div className={cn(edClass, "grid gap-4 px-6 pb-2")} style={ON_MAIZ} aria-label={`${mode === "in" ? P.inLabel : P.outLabel} · ${P.title}`}>
        <div className="flex gap-2">
          {(Object.keys(PRODUCT) as Product[]).map((id) => (
            <PillChip key={id} selected={product === id} disabled={busy} onClick={() => reset({ product: id, mode })}>
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
          {deskClosed && <p className="m-meta mt-1 !text-[var(--m-error)]">Desk en pausa · sin operaciones</p>}
          {needsQuote && amt > 0n && !deskClosed && (
            <p className="m-meta mt-1">
              {quote.out === undefined
                ? quote.error
                  ? "Sin cotización · inventario o precio"
                  : "Cotizando…"
                : mode === "in"
                  ? `Recibes ≈ ${fmtAmount(quote.out, 4)} tTBILL · spread incl.`
                  : `Recibes ≈ ${fmtAmount(quote.out)} OUSD · spread incl.`}
            </p>
          )}
        </div>
        <NumericKeypad value={amount} onChange={setAmount} disabled={busy} />
        {act.tx.status === "error" && act.tx.error && (
          <p role="alert" className="text-[14px] font-medium text-[var(--m-error)]">
            {act.tx.error}
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
              const shown = product === "tbills" && mode === "in" && quote.out !== undefined ? quote.out : amt;
              onDone({ product, mode, amount: shown, symbol: product === "tbills" && mode === "in" ? "tTBILL" : cfg.sym, hash: last?.hash, url: last?.url });
              setAmount("");
              act.tx.reset();
            }
          }}
        >
          {busy ? busyLabel(act.tx.status) : mode === "in" ? P.inLabel : P.outLabel}
        </Pill>
        <Meta className="justify-center" parts={["Transacción real en Tempo testnet", "Sin valor real"]} />
      </div>
    </BottomSheet>
  );
}

/* ─────────────────────────────── Success ─────────────────────────────── */

function Listo({ done, close }: { done: Done; close: () => void }) {
  const P = PRODUCT[done.product];
  const verb = done.mode === "in" ? (done.product === "tbills" ? "Comprado." : "Depositado.") : done.product === "tbills" ? "Vendido." : "Retirado.";
  const digits = done.symbol === "tTBILL" ? 4 : 2;
  return (
    <div className="flex flex-1 flex-col px-5 pt-10 pb-6">
      <SuccessCheck size={72} color={MAIZ} />
      <Display size={50} fit className="m-rise mt-8">
        {verb}
      </Display>
      <p className="m-display m-tick m-num mt-4 text-[38px]">
        {done.symbol === "tTBILL" ? "≈ " : ""}
        {fmtAmount(done.amount, digits)} <span className="font-[family-name:var(--font-phone)] text-[16px] font-semibold tracking-normal normal-case">{done.symbol}</span>
      </p>
      <Meta className="mt-2" parts={[P.title, "Confirmado en Tempo", "Testnet · sin valor real"]} />
      <dl className="mt-7 border-t border-[var(--m-on-surface)]">
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
      <div className="mt-auto pt-8">
        <Pill onClick={close}>Listo</Pill>
      </div>
    </div>
  );
}

/* ─────────────────────────────── Actividad ─────────────────────────────── */

const ROW_LABEL: Record<string, string> = {
  "Depósito · ahorro en pesos": "Depósito en pesos",
  "Retiro · ahorro en pesos": "Retiro de pesos",
  "Depósito · ahorro en dólares": "Depósito en dólares",
  "Retiro · ahorro en dólares": "Retiro de dólares",
  "Compra · T-bills": "Compra de T-bills",
  "Venta · T-bills": "Venta de T-bills",
};

function ActivityList({ limit, product }: { limit?: number; product?: Product }) {
  const { address } = useConnection();
  const h = useInvestHistory();
  const now = useNow(60_000);
  const rows = (h.data?.rows ?? []).filter((r) => !product || r.product === product).slice(0, limit ?? 30);
  if (!address) return <p className="py-5 text-[14px] text-[var(--m-on-surface-variant)]">Conecta tu cuenta para ver tus movimientos.</p>;
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
  if (!rows.length) return <p className="py-5 text-[14px] text-[var(--m-on-surface-variant)]">Sin movimientos todavía.</p>;
  return (
    <DayGroups
      items={rows}
      ts={(r: InvestActivity) => r.timestamp}
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
            amount={`${into ? "+" : "−"}${fmtAmount(r.amount, r.symbol === "tTBILL" ? 4 : 2)}`}
            amountSub={r.symbol}
          />
        );
      }}
    />
  );
}

function Actividad() {
  return (
    <div className="pb-6">
      <TopMeta title="Actividad" />
      <div className="px-5 pt-6">
        <Display size={40}>Actividad</Display>
        <Meta className="mt-2" parts={["Depósitos, retiros y T-bills", "On-chain · Tempo testnet"]} />
        <div className="pt-3">
          <ActivityList />
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────── Perfil ─────────────────────────────── */

function Perfil() {
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
      <TopMeta title="Perfil" />
      <div className="px-5 pt-6">
        <Display size={44}>Ahorrador</Display>
        <Meta className="mt-2" parts={["Cuenta demo", "Tempo testnet"]} />
        <dl className="mt-6 border-t border-[var(--m-on-surface)]">
          {rows.map((r) => (
            <div key={r.k} className="flex min-h-14 items-center justify-between gap-3 border-b border-[var(--m-outline-variant)]">
              <dt className="text-[14px] text-[var(--m-on-surface-variant)]">{r.k}</dt>
              <dd className="m-num text-[15px] font-medium">{r.v}</dd>
            </div>
          ))}
        </dl>
        <Meta
          className="mt-6"
          parts={["OUSD: token de testnet, sin valor ni respaldo", "Rendimientos variables, no garantizados", "tTBILL: token demo, no es un valor", "Precios: feeds de administrador"]}
        />
      </div>
    </div>
  );
}
