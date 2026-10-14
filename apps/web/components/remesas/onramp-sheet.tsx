"use client";
// "Agregar dólares con tarjeta": the body of the Remesas on-ramp bottom sheet (mobile kit, M3).
// The card charge is SIMULATED (4242 test card only); the OUSD that lands is a REAL testnet transfer
// from the on-ramp float, with its explorer link. Keeps ONRAMP_LABEL visible. Uses useOnramp() (web).
import { useState } from "react";
import { CreditCard, ExternalLink, Wallet } from "lucide-react";
import { ONRAMP_LABEL, ONRAMP_MAX_PER_TX, ONRAMP_TEST_CARD, useOnramp } from "@/lib/remesas/use-onramp";
import { Banner, Button, Chip, DemoBadge, DetailRows, LinearProgress, SuccessCheck, fmtMoney } from "@/components/mobile";

const AMOUNTS = [50, 100, 250, 500];

export function OnrampSheet({ onDone }: { onDone?: () => void }) {
  const o = useOnramp();
  const [amount, setAmount] = useState(100);
  const [card, setCard] = useState(ONRAMP_TEST_CARD);
  const busy = o.stage === "charging" || o.stage === "delivering";

  if (o.stage === "done" && o.result)
    return (
      <div className="grid justify-items-center gap-3 px-6 pt-2 text-center">
        <SuccessCheck size={72} />
        <p className="text-[22px]">¡Listo! Agregaste</p>
        <p className="m-num text-[40px] leading-none font-medium">US{fmtMoney(BigInt(o.result.amount))}</p>
        <p className="text-[14px] text-[var(--m-on-surface-variant)]">OUSD llegó a tu cuenta, on-chain · arrived in your wallet</p>
        <div className="w-full text-left">
          <DetailRows
            rows={[
              { label: "Tarjeta", value: `•••• ${o.result.simulatedCharge.last4}`, sub: "cargo simulado · simulated charge" },
              {
                label: "Transferencia",
                value: (
                  <a href={o.result.explorerUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-mono text-[#b45309]">
                    {o.result.txHash.slice(0, 10)}… <ExternalLink className="size-3.5" />
                  </a>
                ),
                sub: "Real, Tempo testnet",
              },
            ]}
          />
        </div>
        <Button variant="dark" className="mt-1 w-full" onClick={() => (o.reset(), onDone?.())}>
          Listo · Done
        </Button>
      </div>
    );

  return (
    <div className="grid gap-4 px-6">
      {busy && <LinearProgress />}
      <div className="flex flex-wrap gap-2">
        {AMOUNTS.map((a) => (
          <Chip key={a} selected={amount === a} disabled={busy} onClick={() => setAmount(a)}>
            US${a}
          </Chip>
        ))}
      </div>
      <div className="grid gap-3 rounded-[16px] bg-white p-4 shadow-[0_1px_2px_rgb(0_0_0/0.08)]">
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-2 text-[14px] text-[var(--m-on-surface-variant)]">
            <CreditCard className="size-5" strokeWidth={1.75} /> Tarjeta
          </span>
          <DemoBadge>Solo tarjeta de prueba</DemoBadge>
        </div>
        <Field label="Número de tarjeta" value={card.number} disabled={busy} mono onChange={(v) => setCard({ ...card, number: v })} aria="Card number (test card 4242 4242 4242 4242)" />
        <div className="grid grid-cols-2 gap-3">
          <Field label="Vence" value={card.exp} disabled={busy} onChange={(v) => setCard({ ...card, exp: v })} aria="Expiry" />
          <Field label="CVC" value={card.cvc} disabled={busy} onChange={(v) => setCard({ ...card, cvc: v })} aria="CVC" />
        </div>
      </div>
      <p className="text-[13px] leading-[1.4] text-[var(--m-on-surface-variant)]">{ONRAMP_LABEL}</p>
      {o.error && <Banner tone="error">{o.error}</Banner>}
      <Button loading={busy} disabled={busy || amount > ONRAMP_MAX_PER_TX} onClick={() => o.buyWithCard(amount, card)}>
        {busy ? (o.stage === "charging" ? "Procesando tarjeta (simulada)…" : "Enviando OUSD on-chain…") : `Pagar US$${amount} con tarjeta`}
      </Button>
      {o.canTempoDeposit && (
        <Button variant="tonal" disabled={busy} icon={<Wallet className="size-5" strokeWidth={1.75} />} onClick={() => o.tempoDeposit(amount)}>
          Agregar fondos con Tempo Wallet
        </Button>
      )}
    </div>
  );
}

function Field({ label, value, onChange, disabled, mono, aria }: { label: string; value: string; onChange: (v: string) => void; disabled?: boolean; mono?: boolean; aria: string }) {
  return (
    <label className="relative grid min-w-0">
      <span className="absolute -top-2 left-3 bg-white px-1 text-[12.5px] text-[var(--m-on-surface-variant)]">{label}</span>
      <input
        value={value}
        disabled={disabled}
        inputMode="numeric"
        aria-label={aria}
        onChange={(e) => onChange(e.target.value)}
        className={`m-num h-14 w-full min-w-0 rounded-[4px] border border-[var(--m-outline)] bg-transparent px-4 text-[16px] outline-none focus:border-2 focus:border-[var(--m-accent)] ${mono ? "tracking-[0.08em]" : ""}`}
      />
    </label>
  );
}
