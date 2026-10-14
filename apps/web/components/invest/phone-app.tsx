"use client";
// Mercado Invest phone app (Spanish-first, English sub-labels): Inicio → Ahorro en pesos / Ahorro en dólares /
// T-bills, each with a keypad sheet. Every action is a real on-chain transaction (see use-invest.ts).
import { useState } from "react";
import { ArrowLeft, Coins, DollarSign, Landmark } from "lucide-react";
import { explorerTx } from "@mercado/shared";
import { PhoneKeypad as Keypad } from "@/components/console";
import { TxProgress } from "@/components/shell/tx-progress";
import { useBalances } from "@/lib/contracts";
import { fmtAmount, toUnits } from "@/lib/format";
import { useReportBusy } from "@/lib/busy";
import { cn } from "@/lib/utils";
import {
  INVEST,
  useInvestActions,
  useInvestHistory,
  useInvestPositions,
  useTbillQuote,
} from "./use-invest";

export type Screen = "inicio" | "pesos" | "dolares" | "tbills";

const m = (v: bigint | undefined, d = 2) =>
  v === undefined ? "…" : fmtAmount(v, d);
const pct = (bps: bigint | undefined) =>
  bps === undefined ? "…" : `${(Number(bps) / 100).toFixed(2)}%`;

export function PhoneApp() {
  const [screen, setScreen] = useState<Screen>("inicio");
  return (
    <div className="flex h-full flex-col bg-white text-[#111418]">
      {screen === "inicio" ? (
        <Inicio go={setScreen} />
      ) : (
        <Product kind={screen} back={() => setScreen("inicio")} />
      )}
    </div>
  );
}

function Inicio({ go }: { go: (s: Screen) => void }) {
  const p = useInvestPositions();
  const h = useInvestHistory();
  const cards = [
    {
      id: "pesos" as const,
      icon: Coins,
      title: "Ahorro en pesos",
      sub: "Peso savings · funds driver advances",
      value: `${m(p.pesos.balance)} xMXN`,
      rate: "Rendimiento variable: comisiones reales de choferes",
    },
    {
      id: "dolares" as const,
      icon: DollarSign,
      title: "Ahorro en dólares",
      sub: "Dollar savings · sOUSD",
      value: `${m(p.dollars?.value)} OUSD`,
      rate: `APR demo ${pct(p.dollars?.aprBps)} · fondeado por admin`,
    },
    {
      id: "tbills" as const,
      icon: Landmark,
      title: "T-bills (CETES-style)",
      sub: "Demo tokenized T-bill · tTBILL",
      value: `${m(p.tbill?.balance, 4)} tTBILL`,
      rate: `Precio $${p.tbill?.px8 === undefined ? "…" : (Number(p.tbill.px8) / 1e8).toFixed(2)} · feed admin`,
    },
  ];
  return (
    <div className="flex-1 overflow-y-auto px-4 pt-4 pb-6">
      <p className="text-[13px] text-[#5B6270]">Mercado Invest</p>
      <h2 className="mt-1 text-xl font-semibold">Haz crecer tu dinero</h2>
      <p className="text-[13px] text-[#5B6270]">
        Grow your money · testnet demo
      </p>
      <div className="mt-4 grid gap-3">
        {cards.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => go(c.id)}
            className="flex items-start gap-3 rounded-[16px] bg-[#F4F5F7] p-4 text-left hover:bg-[#ECEEF1]"
          >
            <span className="bg-product text-product-fg grid size-10 shrink-0 place-items-center rounded-[12px]">
              <c.icon className="size-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-semibold">{c.title}</span>
              <span className="block text-[13px] text-[#5B6270]">{c.sub}</span>
              <span className="tabular mt-2 block text-lg font-semibold">
                {c.value}
              </span>
              <span className="block text-[13px] text-[#5B6270]">{c.rate}</span>
            </span>
          </button>
        ))}
      </div>
      <p className="mt-6 text-[13px] font-semibold">Actividad · Activity</p>
      {!h.data && (
        <p className="mt-2 text-[13px] text-[#5B6270]">Leyendo la cadena…</p>
      )}
      {h.data?.rows.length === 0 && (
        <p className="mt-2 text-[13px] text-[#5B6270]">
          Sin movimientos todavía.
        </p>
      )}
      <ul className="mt-1 divide-y divide-[#E6E8EC]">
        {h.data?.rows.slice(0, 5).map((r) => (
          <li
            key={`${r.txHash}-${r.logIndex}`}
            className="flex items-center justify-between gap-2 py-2 text-[13px]"
          >
            <a
              href={explorerTx(r.txHash)}
              target="_blank"
              rel="noreferrer"
              className="min-w-0 truncate hover:underline"
            >
              {r.label}
            </a>
            <span className="tabular shrink-0 font-medium">
              {fmtAmount(r.amount, r.symbol === "tTBILL" ? 4 : 2)} {r.symbol}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Product({
  kind,
  back,
}: {
  kind: Exclude<Screen, "inicio">;
  back: () => void;
}) {
  const p = useInvestPositions();
  const bal = useBalances();
  const act = useInvestActions();
  const [mode, setMode] = useState<"in" | "out">("in");
  const [amount, setAmount] = useState("");
  const amt = toUnits(amount || "0");
  useReportBusy(act.tx.isBusy);
  const quote = useTbillQuote(
    mode === "in" ? "buy" : "sell",
    kind === "tbills" ? amt : 0n,
  );

  const cfg = {
    pesos: {
      title: "Ahorro en pesos",
      inLabel: "Depositar",
      outLabel: "Retirar",
      symIn: "xMXN",
      symOut: "xMXN",
      wallet: bal.xmxn,
      position: p.pesos.balance,
      maxOut: p.pesos.withdrawable, // R-044: min(own claim, idle pool cash)
      note: "Tu dinero financia adelantos a choferes. Ganas una parte de las comisiones que pagan al repagar: variable, no garantizado. Solo el efectivo no prestado se puede retirar.",
      run: () =>
        mode === "in" ? act.depositPesos(amt) : act.withdrawPesos(amt),
    },
    dolares: {
      title: "Ahorro en dólares",
      inLabel: "Depositar",
      outLabel: "Retirar",
      symIn: "OUSD",
      symOut: "OUSD",
      wallet: bal.ousd,
      position: p.dollars?.value,
      maxOut: p.dollars?.value,
      note: `sOUSD acumula rendimiento de una reserva demo fondeada por el administrador (APR ${pct(p.dollars?.aprBps)}). Demo yield source, admin-funded on testnet.`,
      run: () =>
        mode === "in" ? act.depositDolares(amt) : act.withdrawDolares(amt),
    },
    tbills: {
      title: "T-bills",
      inLabel: "Comprar",
      outLabel: "Vender",
      symIn: mode === "in" ? "OUSD" : "tTBILL",
      symOut: "tTBILL",
      wallet: mode === "in" ? bal.ousd : p.tbill?.balance,
      position: p.tbill?.balance,
      // Sellable = what you hold AND bought at this desk (buy-back is personal, non-transferable).
      maxOut:
        p.tbill?.balance !== undefined && p.desk?.sellable !== undefined
          ? p.tbill.balance < p.desk.sellable
            ? p.tbill.balance
            : p.desk.sellable
          : undefined,
      note: "Demo tokenized T-bill: not a security, admin price feed. Se compra y vende contra el inventario finito del Invest Desk, con un spread pequeño. El desk solo recompra lo que compraste aquí con esta cuenta. También sirve como colateral en Mercado Mint.",
      run: () =>
        quote.out === undefined
          ? undefined
          : mode === "in"
            ? act.buyTbill(amt, quote.out)
            : act.sellTbill(amt, quote.out),
    },
  }[kind];
  const limit = mode === "in" ? cfg.wallet : cfg.maxOut;
  const over = limit !== undefined && amt > limit;
  const needsQuote = kind === "tbills";
  // R-043: a paused desk still returns positive quotes, but trades revert; treat it (or unknown) as closed.
  const deskClosed =
    kind === "tbills" && (!INVEST.desk || p.desk?.paused !== false);
  const disabled =
    amt === 0n ||
    over ||
    act.tx.isBusy ||
    (needsQuote && quote.out === undefined) ||
    deskClosed;

  return (
    <div className="flex flex-1 flex-col overflow-y-auto px-4 pt-3 pb-4">
      <button
        type="button"
        onClick={back}
        className="flex w-fit items-center gap-1 text-[13px] text-[#5B6270]"
      >
        <ArrowLeft className="size-4" /> Inicio
      </button>
      <h2 className="mt-2 text-xl font-semibold">{cfg.title}</h2>
      <p className="tabular text-[13px] text-[#5B6270]">
        Tienes {m(cfg.position, kind === "tbills" ? 4 : 2)}{" "}
        {kind === "tbills" ? "tTBILL" : cfg.symOut}
      </p>
      <div className="mt-3 grid grid-cols-2 rounded-full bg-[#F4F5F7] p-1 text-[13px] font-medium">
        {(["in", "out"] as const).map((md) => (
          <button
            key={md}
            type="button"
            onClick={() => {
              setMode(md);
              setAmount("");
              act.tx.reset();
            }}
            className={cn(
              "rounded-full py-1.5",
              mode === md && "bg-white shadow-sm",
            )}
          >
            {md === "in" ? cfg.inLabel : cfg.outLabel}
          </button>
        ))}
      </div>
      <p className="tabular mt-4 text-center text-4xl font-semibold">
        {amount || "0"}{" "}
        <span className="text-lg text-[#5B6270]">{cfg.symIn}</span>
      </p>
      <p className="mt-1 text-center text-[13px] text-[#5B6270]">
        {mode === "in" ? "Disponible" : "Máximo"}:{" "}
        {m(limit, kind === "tbills" && mode === "out" ? 4 : 2)} {cfg.symIn}
        {over && <span className="text-destructive"> · excede el máximo</span>}
      </p>
      {kind === "tbills" && p.desk?.paused && (
        <p className="text-destructive mt-1 text-center text-[13px]">
          Invest Desk en pausa · trading paused
        </p>
      )}
      {needsQuote && amt > 0n && !p.desk?.paused && (
        <p className="tabular mt-1 text-center text-[13px]">
          {quote.out === undefined
            ? quote.error
              ? "Sin cotización (inventario o precio)"
              : "Cotizando…"
            : mode === "in"
              ? `Recibes ≈ ${fmtAmount(quote.out, 4)} tTBILL · spread incl.`
              : `Recibes ≈ ${fmtAmount(quote.out)} OUSD · spread incl.`}
        </p>
      )}
      <div className="mt-3">
        <Keypad value={amount} onChange={setAmount} disabled={act.tx.isBusy} />
      </div>
      <button
        type="button"
        disabled={disabled}
        onClick={() => cfg.run()}
        className="bg-product text-product-fg mt-3 h-12 rounded-full font-semibold disabled:opacity-40"
      >
        {act.tx.isBusy
          ? "Procesando…"
          : mode === "in"
            ? cfg.inLabel
            : cfg.outLabel}
      </button>
      <p className="mt-3 text-[12px] leading-snug text-[#5B6270]">{cfg.note}</p>
      <TxProgress
        tx={act.tx}
        className="mt-3"
        successNote="Listo. Confirmado en Tempo."
      />
    </div>
  );
}
