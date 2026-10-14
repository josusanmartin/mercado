"use client";
// "Agregar dólares con tarjeta" sheet for the Remesas phone (@mobile can restyle with the M3 kit;
// keep the label, the 4242-only rule and the explorer link). Uses useOnramp().
import { useState } from "react";
import { Check, CreditCard, ExternalLink, Loader2, Wallet } from "lucide-react";
import { fmtAmount } from "@/lib/format";
import { cn } from "@/lib/utils";
import { ONRAMP_LABEL, ONRAMP_MAX_PER_TX, ONRAMP_TEST_CARD, useOnramp } from "@/lib/remesas/use-onramp";

const ORANGE = "#ff8a1f";
const AMOUNTS = [50, 100, 250, 500];

export function OnrampSheet({ onDone }: { onDone?: () => void }) {
  const o = useOnramp();
  const [amount, setAmount] = useState(100);
  const [card, setCard] = useState(ONRAMP_TEST_CARD);
  const busy = o.stage === "charging" || o.stage === "delivering";

  if (o.stage === "done" && o.result)
    return (
      <div className="grid gap-3 px-4 py-5 text-center">
        <span className="mx-auto grid size-14 place-items-center rounded-full text-white" style={{ background: ORANGE }}>
          <Check className="size-7" />
        </span>
        <p className="text-lg font-semibold">¡Listo! · Added</p>
        <p className="text-[2rem] leading-none font-semibold tabular">${fmtAmount(BigInt(o.result.amount))}</p>
        <p className="text-[13px] text-[#5b6270]">OUSD llegó a tu cuenta · arrived in your wallet, on-chain</p>
        <a href={o.result.explorerUrl} target="_blank" rel="noreferrer" className="inline-flex items-center justify-center gap-1 text-[13px] font-medium hover:underline">
          Ver la transferencia · View transfer <ExternalLink className="size-3.5" />
        </a>
        <p className="text-[13px] text-[#5b6270]">Tarjeta •••• {o.result.simulatedCharge.last4} · simulated charge</p>
        <button type="button" onClick={() => (o.reset(), onDone?.())} className="mt-2 h-12 rounded-[12px] bg-[#111418] text-[16px] font-semibold text-white">
          Listo · Done
        </button>
      </div>
    );

  return (
    <div className="grid gap-4 px-4 py-4">
      <div>
        <p className="text-lg font-semibold">Agregar dólares</p>
        <p className="text-[13px] text-[#5b6270]">Add dollars with a card</p>
      </div>
      <div className="grid grid-cols-4 gap-2">
        {AMOUNTS.map((a) => (
          <button
            key={a}
            type="button"
            disabled={busy}
            onClick={() => setAmount(a)}
            className={cn("h-11 rounded-[10px] border text-[15px] font-semibold tabular", amount === a ? "border-[#111418] bg-[#111418] text-white" : "border-[#e6e8ec] bg-white")}
          >
            ${a}
          </button>
        ))}
      </div>
      <div className="grid gap-2 rounded-[14px] border border-[#e6e8ec] p-3">
        <p className="flex items-center gap-2 text-[13px] text-[#5b6270]">
          <CreditCard className="size-4" /> Tarjeta de prueba · test card only
        </p>
        <input
          value={card.number}
          disabled={busy}
          onChange={(e) => setCard({ ...card, number: e.target.value })}
          inputMode="numeric"
          className="h-11 rounded-[10px] border border-[#e6e8ec] px-3 font-mono text-[15px] tabular"
          aria-label="Card number (test card 4242 4242 4242 4242)"
        />
        <div className="grid grid-cols-2 gap-2">
          <input value={card.exp} disabled={busy} onChange={(e) => setCard({ ...card, exp: e.target.value })} className="h-11 rounded-[10px] border border-[#e6e8ec] px-3 tabular" aria-label="Expiry" />
          <input value={card.cvc} disabled={busy} onChange={(e) => setCard({ ...card, cvc: e.target.value })} className="h-11 rounded-[10px] border border-[#e6e8ec] px-3 tabular" aria-label="CVC" />
        </div>
      </div>
      <p className="rounded-[10px] bg-[#f4f5f7] px-3 py-2 text-[13px] text-[#5b6270]">{ONRAMP_LABEL}</p>
      {o.error && <p className="text-[13px] text-[#d92d20]">{o.error}</p>}
      <button
        type="button"
        disabled={busy || amount > ONRAMP_MAX_PER_TX}
        onClick={() => o.buyWithCard(amount, card)}
        className="flex h-12 items-center justify-center gap-2 rounded-[12px] text-[16px] font-semibold text-white disabled:opacity-40"
        style={{ background: ORANGE }}
      >
        {busy ? (
          <>
            <Loader2 className="size-4 animate-spin" /> {o.stage === "charging" ? "Procesando tarjeta (simulada)…" : "Enviando OUSD on-chain…"}
          </>
        ) : (
          <>Pagar ${amount} con tarjeta · Pay</>
        )}
      </button>
      {o.canTempoDeposit && (
        <button type="button" disabled={busy} onClick={() => o.tempoDeposit(amount)} className="flex h-11 items-center justify-center gap-2 rounded-[12px] bg-[#f4f5f7] text-[15px] font-semibold">
          <Wallet className="size-4" /> Agregar fondos con Tempo Wallet
        </button>
      )}
    </div>
  );
}
