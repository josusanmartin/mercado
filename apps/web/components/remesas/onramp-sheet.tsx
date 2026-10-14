"use client";
// "Agregar dólares con tarjeta": the body of the Remesas on-ramp bottom sheet (mobile kit). Spanish only;
// ONRAMP_LABEL (English) also sits in the desktop panel.
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
      <div className="grid justify-items-start gap-3 px-6 pt-2">
        <SuccessCheck size={72} />
        <p className="m-display text-[30px]">Listo</p>
        <p className="m-display text-[44px]">US{fmtMoney(BigInt(o.result.amount))}</p>
        <p className="m-meta">OUSD en tu cuenta · en la cadena</p>
        <div className="w-full text-left">
          <DetailRows
            rows={[
              { label: "Tarjeta", value: `•••• ${o.result.simulatedCharge.last4}`, sub: "cargo simulado" },
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
          Listo
        </Button>
      </div>
    );

  // Card top-ups stay paused until review accepts the route (ONRAMP_ENABLED); Tempo Wallet funding is always real.
  if (!o.enabled)
    return (
      <div className="grid gap-4 px-6">
        <Banner tone="info" icon={<CreditCard strokeWidth={1.75} />}>
          <span className="font-semibold">Próximamente.</span> Las recargas con tarjeta están en pausa por una revisión de seguridad.
        </Banner>
        {o.canTempoDeposit && (
          <Button variant="tonal" icon={<Wallet className="size-5" strokeWidth={1.75} />} onClick={() => o.tempoDeposit()}>
            Agregar fondos con Tempo Wallet
          </Button>
        )}
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
      <div className="grid gap-4 border-y border-[var(--m-outline-variant)] py-4">
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-2 text-[14px] text-[var(--m-on-surface-variant)]">
            <CreditCard className="size-5" strokeWidth={1.75} /> <span className="m-meta text-[var(--m-on-surface)]">Tarjeta</span>
          </span>
          <DemoBadge>Solo 4242 · prueba</DemoBadge>
        </div>
        <Field label="Número de tarjeta" value={card.number} disabled={busy} mono onChange={(v) => setCard({ ...card, number: v })} aria="Card number (test card 4242 4242 4242 4242)" />
        <div className="grid grid-cols-2 gap-3">
          <Field label="Vence" value={card.exp} disabled={busy} onChange={(v) => setCard({ ...card, exp: v })} aria="Expiry" />
          <Field label="CVC" value={card.cvc} disabled={busy} onChange={(v) => setCard({ ...card, cvc: v })} aria="CVC" />
        </div>
      </div>
      <p className="m-meta" title={ONRAMP_LABEL}>
        Cargo simulado · los dólares llegan de verdad (testnet)
      </p>
      {o.error && <Banner tone="error">{o.error}</Banner>}
      <Button variant="accent" loading={busy} disabled={busy || amount > ONRAMP_MAX_PER_TX} onClick={() => o.buyWithCard(amount, card)}>
        {busy ? (o.stage === "charging" ? "Procesando tarjeta (simulada)…" : "Enviando OUSD on-chain…") : `Pagar US$${amount}`}
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
    <label className="grid min-w-0 gap-1">
      <span className="m-meta">{label}</span>
      <input
        value={value}
        disabled={disabled}
        inputMode="numeric"
        aria-label={aria}
        onChange={(e) => onChange(e.target.value)}
        className={`m-num h-12 w-full min-w-0 border-b-2 border-[var(--m-outline)] bg-transparent text-[18px] outline-none focus:border-[var(--m-accent)] ${mono ? "tracking-[0.08em]" : ""}`}
      />
    </label>
  );
}
